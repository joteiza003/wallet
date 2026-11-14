const $=id=>document.getElementById(id);
const sections=['select','working','ready','failed'];
function show(id){sections.forEach(s=>$(s).classList.toggle('hidden',s!==id));$('main').setAttribute('aria-busy',String(id==='working'));}
function progress(label,pct,indeterminate=false){
 $('status').textContent=label;
 const el=$('bar');el.style.width=pct+'%';el.classList.toggle('indet',indeterminate);
}
function failure(message){$('message').textContent=message;show('failed');$('retry').focus();}
let processing=false;
async function readQr(file){
 if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>10*1024*1024 || !file.size)throw new Error('Selecciona una imagen PNG, JPG o WebP de hasta 10 MB.');
 if(typeof jsQR!=='function')throw new Error('No se pudo cargar el lector QR.');
 let bmp;
 try{bmp=await createImageBitmap(file);}catch{throw new Error('No se pudo abrir la imagen. Prueba con una captura de pantalla en PNG o JPG.');}
 if(bmp.width*bmp.height>20_000_000){bmp.close();throw new Error('La imagen tiene demasiados píxeles.');}
 const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
 const ctx=c.getContext('2d',{willReadFrequently:true});
 if(!ctx){bmp.close();throw new Error('No se pudo analizar la imagen en este navegador.');}
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0);bmp.close();
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
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),60000);
  let res;
  try{res=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({qr})});}
  finally{clearTimeout(timer);}
  let data;try{data=await res.json();}catch{throw new Error('El servicio no ha devuelto una respuesta válida.');}
  if(!res.ok || !data.ok)throw new Error(data.message || (res.status===429?'El servicio ha alcanzado su límite diario. Inténtalo mañana.':'No se pudo procesar la entrada.'));
  const url=new URL(data.downloadUrl);
  if(url.protocol!=='https:' || url.hostname!=='www.joseba-bakartxo.com' || url.pathname!=='/_functions/walletDownload' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token')||''))throw new Error('El enlace de descarga no es válido.');
  $('download').href=url.toString();
  $('expiry').classList.toggle('hidden',!!data.stored);
  progress('Pase preparado',100);show('ready');$('download').focus();
 }catch(e){failure(e.name==='AbortError'?'El servicio está tardando demasiado. Vuelve a intentarlo en unos instantes.':e instanceof TypeError?'No hemos podido conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.':e.message||'Error inesperado.');}
 finally{processing=false;}
}
$('file').addEventListener('change',e=>uploaded(e.target.files[0]));
$('choose').addEventListener('click',()=>$('file').click());
$('drop').addEventListener('dragover',e=>{e.preventDefault();$('drop').classList.add('drag');});
$('drop').addEventListener('dragleave',()=>$('drop').classList.remove('drag'));
$('drop').addEventListener('drop',e=>{e.preventDefault();$('drop').classList.remove('drag');uploaded(e.dataTransfer.files[0]);});
function restart(){processing=false;$('file').value='';$('download').removeAttribute('href');show('select');$('choose').focus();}
$('again').addEventListener('click',restart);$('retry').addEventListener('click',restart);
