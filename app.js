const $=id=>document.getElementById(id);
const sections=['select','working','ready','failed'];
function show(id){sections.forEach(s=>$(s).classList.toggle('hidden',s!==id));}
function progress(label,pct,indeterminate=false){
 $('status').textContent=label;
 const el=$('bar');el.style.width=pct+'%';el.classList.toggle('indet',indeterminate);
}
function failure(message){$('message').textContent=message;show('failed');}
let processing=false;
async function readQr(file){
 if(!file || file.type!=='image/png' || file.size>10*1024*1024)throw new Error('Selecciona un PNG de menos de 10 MB.');
 if(typeof jsQR!=='function')throw new Error('No se pudo cargar el lector QR.');
 const bmp=await createImageBitmap(file);
 if(bmp.width*bmp.height>20_000_000){bmp.close();throw new Error('La imagen tiene demasiados píxeles.');}
 const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,0,0);bmp.close();
 const code=jsQR(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height,{inversionAttempts:'attemptBoth'});
 if(!code?.data)throw new Error('No encontramos ningún código QR legible.');
 if(code.data.length>500)throw new Error('El contenido del QR es demasiado largo.');
 return code.data;
}
async function uploaded(file){
 if(processing)return;
 processing=true;show('working');progress('Leyendo el QR de tu entrada...',20);
 try{
  const qr=await readQr(file);
  progress('Buscando los datos de tu entrada...',45);
  const endpoint=window.WALLET_CONFIG?.generateEndpoint;
  if(!endpoint?.startsWith('https://'))throw new Error('El servicio aún no está configurado.');
  progress('Generando el pase para Apple Wallet...',70,true);
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qr})});
  let data;try{data=await res.json();}catch{throw new Error('El servicio no ha devuelto una respuesta válida.');}
  if(!res.ok || !data.ok)throw new Error(data.message || (res.status===429?'Se ha agotado el cupo gratuito. Inténtalo mañana.':'No se pudo procesar la entrada.'));
  const url=new URL(data.downloadUrl);
  if(url.protocol!=='https:' || url.hostname!=='www.joseba-bakartxo.com' || url.pathname!=='/_functions/walletDownload' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token')||''))throw new Error('El enlace de descarga no es válido.');
  $('download').href=url.toString();
  $('expiry').classList.toggle('hidden',!!data.stored);
  progress('Pase preparado',100);show('ready');
 }catch(e){failure(e instanceof TypeError?'No hemos podido conectar con Wix. Revisa la publicación del endpoint y CORS.':e.message||'Error inesperado.');}
 finally{processing=false;}
}
$('file').addEventListener('change',e=>uploaded(e.target.files[0]));
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('drag');});
$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('drag');uploaded(e.dataTransfer.files[0]);});
function restart(){processing=false;$('file').value='';show('select');}
$('again').addEventListener('click',restart);$('retry').addEventListener('click',restart);
