#!/usr/bin/env python3
"""Capture a fixed Cursor CLI logged-out PTY; never submit a login keystroke."""
import argparse,fcntl,hashlib,json,os,pathlib,pty,re,select,struct,subprocess,tempfile,termios,time,sys
VERSION='2026.10.01-e373342'
parser=argparse.ArgumentParser();parser.add_argument('--binary',required=True);parser.add_argument('--output',required=True)
args=parser.parse_args();
if sys.platform!='darwin':raise RuntimeError('This isolated evidence probe supports macOS only')
binary=str(pathlib.Path(args.binary).resolve());output=pathlib.Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='omaa-cursor-tty-') as tmp:
 root=pathlib.Path(tmp);home=os.environ['HOME']
 profile='''(version 1)
(allow default)
(deny network*)
(deny process-exec (literal "/usr/bin/security") (literal "/usr/bin/open"))
(deny mach-lookup (global-name-regex #"^com[.]apple[.]security.*"))
(deny file-read* (subpath "USERHOME/.cursor") (subpath "USERHOME/.config/cursor") (subpath "USERHOME/Library/Keychains") (subpath "USERHOME/Library/Application Support/Cursor"))
(deny file-write*)
(allow file-write* (subpath "TASKROOT") (literal "/dev/null") (literal "/dev/tty"))
'''.replace('USERHOME',home).replace('TASKROOT',str(root))
 # /tmp aliases on macOS must resolve to the actual allowed path.
 profile=profile.replace(str(root),str(root.resolve()))
 sandbox=root/'isolation.sb';sandbox.write_text(profile)
 results=[]
 for variant,fg,bg in [('dark','#e0e0e0','#101010'),('light','#202020','#f4f4f4')]:
  run=root/variant;run.mkdir()
  env={key:os.environ[key] for key in ['PATH','HOME','LANG'] if key in os.environ}
  env.update({'TERM':'xterm-256color','COLORTERM':'truecolor','COLORFGBG':'15;0' if variant=='dark' else '0;15','CURSOR_CONFIG_DIR':str(run/'config'),'CURSOR_DATA_DIR':str(run/'data'),'AGENT_CLI_CREDENTIAL_STORE':'file','NODE_COMPILE_CACHE':str(run/'node-cache'),'AGENT_CLI_LOG_PATH':str(run/'cli.log')})
  command=['/usr/bin/sandbox-exec','-f',str(sandbox),binary]
  version=subprocess.run(command+['--version'],cwd=run,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
  if version.returncode or version.stdout.decode().strip()!=VERSION:raise RuntimeError('Unexpected Cursor CLI version')
  master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',32,100,0,0))
  child=subprocess.Popen(command,cwd=run,env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True);os.close(slave)
  captured=bytearray();queries=[];end=time.monotonic()+7
  try:
   while time.monotonic()<end and child.poll() is None:
    if not select.select([master],[],[],0.15)[0]:continue
    try:data=os.read(master,65536)
    except OSError:break
    captured.extend(data)
    if len(captured)>1024*1024:raise RuntimeError('PTY output limit reached')
    for code in [10,11]:
     if b'\x1b]'+str(code).encode()+b';?' in data:
      color=fg if code==10 else bg;rgb='/'.join(color[index:index+2]*2 for index in [1,3,5]);reply=f'\x1b]{code};rgb:{rgb}\x1b\\'.encode();os.write(master,reply);queries.append({'osc':code,'reply':reply.decode()})
    if b'\x1b[6n' in data:os.write(master,b'\x1b[1;1R')
  finally:
   child.terminate()
   try:child.wait(timeout=2)
   except subprocess.TimeoutExpired:child.kill();child.wait()
   os.close(master)
  data=bytes(captured);(output/f'logged-out-{variant}.ansi').write_bytes(data)
  result={'variant':variant,'version':VERSION,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'exitCode':child.returncode,'terminalQueryReplies':queries,'sgr':sorted({match.decode() for match in re.findall(rb'\x1b\[([0-9;:]*)m',data)}),'nominalEmulatorForeground':fg,'nominalEmulatorBackground':bg}
  results.append(result)
 (output/'measurement.json').write_text(json.dumps({'scope':'isolated logged-out startup only','rows':32,'columns':100,'networkDenied':True,'keychainDenied':True,'authenticationInputSent':False,'results':results},indent=2)+'\n')
 print(json.dumps({'version':VERSION,'captures':[{'variant':item['variant'],'bytes':item['bytes'],'sha256':item['sha256']} for item in results]}))
