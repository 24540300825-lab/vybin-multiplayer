const fs=require('fs'),z=require('zlib');
const [src,dst]=process.argv.slice(2);const b=fs.readFileSync(src);
const n=b.readUInt32LE(b.length-9),desc=b[b.length-5],mag=b.readUInt32LE(b.length-4);
if(mag!==0x8F92EAB1)throw new Error('no seek table '+mag.toString(16));
const es=(desc&0x80)?12:8,tbl=b.length-9-n*es;
const out=fs.openSync(dst,'w');let off=0,tot=0;
for(let i=0;i<n;i++){const cs=b.readUInt32LE(tbl+i*es);const d=z.zstdDecompressSync(b.subarray(off,off+cs));fs.writeSync(out,d);off+=cs;tot+=d.length}
fs.closeSync(out);console.log('frames',n,'size',tot);
