import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';
const command=readFileSync(process.argv[2],'utf8');const exe=new URL('../node_modules/agent-browser/bin/agent-browser-win32-x64.exe',import.meta.url).pathname.replace(/^\//,'');
const args=['--session','nicu-server','--cdp','ws://127.0.0.1:9222/devtools/browser'];
const script=`(()=>{const dt=new DataTransfer();dt.setData('text/plain',${JSON.stringify(command)});document.querySelector('textarea.xterm-helper-textarea').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));return 'Command pasted'})()`;
console.log(execFileSync(decodeURIComponent(exe),[...args,'eval','--stdin'],{input:script,encoding:'utf8',timeout:20000}).trim());console.log(execFileSync(decodeURIComponent(exe),[...args,'press','Enter'],{encoding:'utf8',timeout:10000}).trim());
