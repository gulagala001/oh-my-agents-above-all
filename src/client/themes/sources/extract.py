"""Offline mechanical extraction from pinned, licensed source snapshots."""
import re, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def sha(data):return hashlib.sha256(data).hexdigest()
def write(name,value):ROOT.joinpath(name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def strip_comments(text):return re.sub(r'/\*.*?\*/',lambda m:re.sub(r'[^\n]',' ',m.group()),text,flags=re.S)
def css_block(text,selector):
    clean=strip_comments(text);m=re.search(re.escape(selector)+r'\s*\{',clean)
    if not m:raise ValueError('Missing selector '+selector)
    start=m.end();depth=1;i=start
    while depth and i<len(clean):
        if clean[i]=='{':depth+=1
        if clean[i]=='}':depth-=1
        i+=1
    block=clean[start:i-1];values={}
    for prop in re.finditer(r'(--[\w-]+)\s*:\s*([^;]+);',block):
        raw_start=start+prop.start(2);raw_end=start+prop.end(2)
        values[prop.group(1)]={'rawName':prop.group(1),'rawValue':text[raw_start:raw_end].strip(),'sourceLine':text[:start+prop.start()].count('\n')+1}
    return values

def extract_grok():
    variants={}
    for scheme,name,native in [('dark','groknight','GrokNight'),('light','grokday','GrokDay')]:
        text=ROOT.joinpath('upstream/'+name+'.rs.txt').read_text();palette={};roles={};modifiers={}
        for m in re.finditer(r'pub const (\w+): Color = ((?:rgb|Color::Rgb)\((\d+),\s*(\d+),\s*(\d+)\));',text):
            palette[m.group(1)]={'rawName':m.group(1),'rawValue':m.group(2),'browserValue':'#'+''.join(f'{int(m.group(i)):02x}' for i in [3,4,5]),'sourceLine':text[:m.start()].count('\n')+1}
        start=text.index('Self {')
        for m in re.finditer(r'^\s+(\w+):\s*((?:rgb|Color::Rgb)\([^\n]+?\)|\w+(?:::\w+\(\))?|Modifier::BOLD),',text[start:],re.M):
            key,raw=m.group(1),m.group(2);line=text[:start+m.start()+m.group().index(key)].count('\n')+1
            if raw.startswith('Modifier::'):
                modifiers[key]={'rawName':key,'rawValue':raw,'cssValue':'bold' if raw=='Modifier::BOLD' else 'normal','sourceLine':line};continue
            if raw in palette:color=palette[raw]['browserValue']
            else:
                rgb=re.fullmatch(r'(?:rgb|Color::Rgb)\((\d+),\s*(\d+),\s*(\d+)\)',raw)
                if not rgb:raise ValueError('Unresolved Grok role '+key+':'+raw)
                color='#'+''.join(f'{int(n):02x}' for n in rgb.groups())
            roles[key]={'rawName':key,'rawValue':raw,'browserValue':color,'sourceLine':line,'paletteReference':raw if raw in palette else None}
        variants[scheme]={'nativeName':native,'snapshot':'upstream/'+name+'.rs.txt','sourceSha256':sha(text.encode()),'palette':palette,'roles':roles,'modifiers':modifiers}
    write('grok-build.json',{'schemaVersion':1,'product':'grok','status':'source-verified','source':{'repository':'https://github.com/xai-org/grok-build','commit':'2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8','sourceRev':'559751fdcec02d413e4c57c8832ab275e4f44980','directory':'crates/codegen/xai-grok-pager-render/src/theme','license':'Apache-2.0','licenseFile':'licenses/grok-build-LICENSE.txt','noticesFile':'licenses/grok-build-THIRD-PARTY-NOTICES.txt','paletteCredit':'The upstream GrokNight source credits TokyoNight Night accent colors; GrokDay deepens that hue family. This extraction preserves the original notices and raw source comments.'},'variants':variants,'limitation':'Canonical truecolor values; terminal quantization and browser role mapping are not reproduced.'})

def extract_zcode():
    text=ROOT.joinpath('upstream/zcode-styles.css.txt').read_text();tw=ROOT.joinpath('upstream/tailwind-theme.css.txt').read_text()
    defaults=css_block(tw,'@theme default');base=css_block(text,'@theme');variants={}
    for key,selector in [('light','@theme'),('dark','.dark'),('zaiLight','.theme-zai-light'),('zaiDark','.theme-zai-dark')]:
        overrides={} if selector=='@theme' else css_block(text,selector)
        middle=css_block(text,'.dark') if key=='zaiDark' else {}
        effective={**base,**middle,**overrides}
        env={**defaults,**effective};tokens={};errors=[]
        def resolve(name,stack=()):
            if name in stack:raise ValueError('Circular CSS reference: '+' -> '.join(stack+(name,)))
            if name not in env:raise ValueError('Unknown CSS reference: '+name)
            raw=env[name]['rawValue']
            return re.sub(r'var\((--[\w-]+)\)',lambda m:resolve(m.group(1),stack+(name,)),raw)
        for name,value in effective.items():
            if not name.startswith('--color-') and not name.startswith('--animated-gradient-text-'):continue
            row={**value,'sourceSelector':selector if name in overrides else '.dark' if name in middle else '@theme','inherited':name not in overrides and selector!='@theme','dependencies':re.findall(r'var\((--[\w-]+)\)',value['rawValue'])}
            try:row['browserValue']=re.sub(r'\s+',' ',resolve(name)).strip();row['status']='resolved-css'
            except ValueError as error:row['browserValue']=None;row['status']='unresolved';row['error']=str(error);errors.append(row['error'])
            tokens[name]=row
        variants[key]={'selector':selector,'cascade':['@theme']+(['.dark'] if key=='zaiDark' else [])+([selector] if selector!='@theme' else []),'tokens':tokens,'unresolved':errors}
    used=set()
    for variant in variants.values():
        for token in variant['tokens'].values():used.update(re.findall(r'var\((--[\w-]+)\)',token['rawValue']))
    write('zcode.json',{'schemaVersion':1,'product':'zcode','status':'source-verified','source':{'repository':'https://github.com/zai-org/ZCode','commit':'29628c9acdb81b703bbd4080c207a0e7ce5e276e','path':'packages/ui/src/styles.css','snapshot':'upstream/zcode-styles.css.txt','sha256':sha(text.encode()),'license':'Apache-2.0','licenseFile':'licenses/zcode-LICENSE.txt'},'dependency':{'name':'tailwindcss','version':'4.2.2','versionEvidence':'pnpm-lock.yaml at the same ZCode commit','source':'https://github.com/tailwindlabs/tailwindcss/blob/v4.2.2/packages/tailwindcss/theme.css','snapshot':'upstream/tailwind-theme.css.txt','sha256':sha(tw.encode()),'license':'MIT','licenseFile':'licenses/tailwindcss-LICENSE.txt'},'nativeSelection':{'sourcePath':'packages/ui/src/useTheme.ts','snapshot':'upstream/zcode-useTheme.ts.txt','sha256':sha(ROOT.joinpath('upstream/zcode-useTheme.ts.txt').read_bytes()),'light':'zaiLight','dark':'zaiDark','default':'zaiDark','normalization':'light/dark preferences normalize to zai-light/zai-dark; dark class coexists with theme-zai-dark'},'tailwindDefaults':{k:v for k,v in defaults.items() if k.startswith('--color-')},'variants':variants,'resolution':'Recursive CSS var substitution preserving the original oklch/oklab color-mix/alpha. browserValue is exact CSS, not a sampled sRGB hex or gamut-clipped conversion. Renderer mapping remains separate.'})

if __name__=='__main__':extract_grok();extract_zcode()
