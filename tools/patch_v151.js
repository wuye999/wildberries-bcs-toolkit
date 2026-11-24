// 官方插件认证桥接补丁；保留官方更新检查。
// 用法：node patch_v151.js [--dir 插件目录] [--check]
// 1.5.1 的 apiService 已移至 pluginFocusReset.js；按认证类定位，不依赖 bundle 名。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MARKER = '__bcsAuthBridge_v151';

function locateAuthBundle(dir) {
  const matches = [];
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
    const file = path.join(dir, name);
    const code = fs.readFileSync(file, 'utf8');
    const tokenDefs = [...code.matchAll(/async\s+getToken\s*\(\s*\)\s*\{/g)];
    for (const def of tokenDefs) {
      const classes = [...code.slice(0, def.index).matchAll(/class\s+([A-Za-z_$][\w$]*)\s*\{/g)];
      const cls = classes.at(-1);
      if (!cls) continue;
      const escaped = cls[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const instances = [...code.matchAll(new RegExp('const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+' + escaped + '\\s*(?:\\(\\s*\\))?\\s*;', 'g'))];
      if (instances.length !== 1) continue;
      const inst = instances[0];
      if (inst.index < def.index || !/async\s+getLimitKey\s*\(/.test(code.slice(cls.index, inst.index))) continue;
      matches.push({ file, code, className: cls[1], instance: inst[1], insertPos: inst.index + inst[0].length });
    }
  }
  if (matches.length !== 1) throw new Error('认证实例定位应唯一，实际找到 ' + matches.length + ' 个；未修改任何文件');
  return matches[0];
}

function makeBridge(instance) {
  // 此共享 bundle 也可能被扩展页面/worker 引用；仅在 WB 顶层页面启用。
  // 白名单避免通过对象原型或任意方法名执行插件内部方法。
  return ';if(typeof window!=="undefined"&&window===window.top&&/^(?:www\\.)?wildberries\\.ru$/.test(window.location.hostname)&&!window.' + MARKER + '){' +
    'window.' + MARKER + '=1;window.__bcsBridge_v1=1;window.__bcsToken_v1=1;' +
    'window.__bcsQuickShelve=Object.create(null);' +
    'window.__bcsQuickShelve.getToken=()=>'+instance+'.getToken();' +
    'window.__bcsQuickShelve.getLimitKey=()=>'+instance+'.getLimitKey();' +
    'window.addEventListener("message",async(e)=>{' +
      'if(e.source!==window||e.origin!==window.location.origin||!e.data||e.data.type!=="BCS_CALL")return;' +
      'const{id,method,args}=e.data;if(typeof id!=="string")return;' +
      'try{' +
        'if(method!=="getToken"&&method!=="getLimitKey")throw new Error("method not found: "+method);' +
        'if(args!=null&&(!Array.isArray(args)||args.length))throw new Error("invalid args");' +
        'const result=await window.__bcsQuickShelve[method]();' +
        'window.postMessage({type:"BCS_RESULT",id,result},window.location.origin)' +
      '}catch(err){window.postMessage({type:"BCS_RESULT",id,error:err&&err.message||String(err)},window.location.origin)}' +
    '});}';
}

function checkSyntax(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ESM 语法校验失败：' + (result.error?.message || result.stderr));
}

function patch(dir, checkOnly = false) {
  const auth = locateAuthBundle(dir);
  console.log('认证锚点：' + path.basename(auth.file) + ' / ' + auth.className + ' → ' + auth.instance);
  const injection = makeBridge(auth.instance);
  if (auth.code.includes(MARKER)) {
    if (!auth.code.includes(injection)) throw new Error('补丁标记存在但桥接内容不符，请检查备份后重试');
    checkSyntax(auth.code);
    console.log('ALREADY APPLIED（ESM 校验通过）');
    return auth;
  }
  if (auth.code.includes('__bcsToken_v1')) throw new Error('发现旧桥接补丁，请使用原始插件目录，避免双重监听');
  const next = auth.code.slice(0, auth.insertPos) + injection + auth.code.slice(auth.insertPos);
  checkSyntax(next);
  if (checkOnly) {
    console.log('CHECK OK（未写入文件）');
    return auth;
  }
  const backup = auth.file + '.bak';
  if (fs.existsSync(backup)) {
    if (fs.readFileSync(backup, 'utf8') !== auth.code) throw new Error('已有 .bak 与当前原文件不同，未覆盖备份、未打补丁');
  } else fs.copyFileSync(auth.file, backup);
  fs.writeFileSync(auth.file, next, 'utf8');
  if (fs.readFileSync(auth.file, 'utf8') !== next) throw new Error('补丁写入核验失败，请从 .bak 恢复');
  console.log('APPLIED：' + auth.file + '\n原文件备份：' + backup + '\n仅添加认证桥接，官方更新功能保留。');
  return auth;
}

if (require.main === module) {
  try {
    let dir = 'WildberriesAl上品助手V1.5.1', checkOnly = false;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dir' && args[i + 1] && !args[i + 1].startsWith('--')) dir = args[++i];
      else if (args[i] === '--check') checkOnly = true;
      else throw new Error('未知或不完整参数：' + args[i]);
    }
    patch(path.resolve(__dirname, '..', dir), checkOnly);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { locateAuthBundle, makeBridge, patch, MARKER };
