/** Tiny observer for the measured startup stream; not a complete terminal emulator. */
export function observeStartupAnsi(input,{rows=32,columns=100}={}) {
  let row=0,column=0,foreground='default',bold=false,dim=false;const cells=new Map(),sgr=new Set(),unsupported=[];
  const reset=()=>{foreground='default';bold=false;dim=false;};
  for(let index=0;index<input.length;){
    if(input[index]==='\x1b'){
      const match=/^\x1b\[([0-?]*)([ -/]*)([@-~])/.exec(input.slice(index));
      if(!match){unsupported.push(input.slice(index,index+12));index++;continue;}
      const [,params,,command]=match;index+=match[0].length;
      if(command==='m'){
        sgr.add(params);for(const code of (params||'0').split(';').map(Number)){
          if(code===0)reset();else if(code===1)bold=true;else if(code===2)dim=true;else if(code===22){bold=false;dim=false;}
          else if(code>=30&&code<=37)foreground=`ansi-${code-30}`;else if(code===39)foreground='default';else unsupported.push(`SGR ${code}`);
        }
      }else if(command==='J'&&params==='2')cells.clear();
      else if(command==='H'||command==='f'){const parts=params.split(';').map(Number);row=(parts[0]||1)-1;column=(parts[1]||1)-1;}
      else if(command==='G')column=(Number(params)||1)-1;
      else if(command==='K'&&params==='2'){for(const key of cells.keys())if(key.startsWith(row+':'))cells.delete(key);}
      else if(command==='l'&&params==='?25'){}
      else unsupported.push(match[0]);
      continue;
    }
    const char=input[index++];if(char==='\r'){column=0;continue;}if(char==='\n'){row++;continue;}
    if(row>=0&&row<rows&&column>=0&&column<columns)cells.set(`${row}:${column}`,{row,column,char,foreground,bold,dim});column++;
  }
  const spans=[];
  for(const cell of [...cells.values()].sort((a,b)=>a.row-b.row||a.column-b.column)){
    const previous=spans.at(-1);
    if(previous&&previous.row===cell.row&&previous.foreground===cell.foreground&&previous.bold===cell.bold&&previous.dim===cell.dim&&cell.column===previous.column+previous.text.length)previous.text+=cell.char;
    else spans.push({...cell,text:cell.char,char:undefined});
  }
  return {rows,columns,spans:spans.filter(span=>span.text.trim()),sgr:[...sgr].sort(),unsupported};
}
