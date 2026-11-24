/* 1:1 AuLK-Unterricht: WebRTC-Bildschirmübertragung, PHP nur für SDP-Signalisierung.
 * Google Slides selbst ist cross-origin und wird NICHT per JS fernbedient.
 * Der Ausbilder teilt stattdessen die eigene Unterrichtstafel als Tab.
 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const room = Number(new URLSearchParams(location.search).get("raum") || 0);
  const invite = (location.hash || "").slice(1);
  const isTrainer = Number.isSafeInteger(room) && room > 0;
  const isGuest = !isTrainer && /^[0-9a-f]{64}$/.test(invite);
  let pc = null, display = null, poller = null, answered = false, joined = false, closed = false;
  let client = null;
  function notice(msg, bad) {
    $("hinweis").textContent = msg;
    $("hinweis").classList.toggle("error", Boolean(bad));
  }
  async function api(url, data) {
    const init = {credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}};
    if (data !== undefined) {
      init.method = "POST";
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(data);
    }
    const res = await fetch(url,init);
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "HTTP " + res.status);
    return result;
  }
  function trainerApi(action, data) {
    return api("/api/ausbildung/unterricht/" + room + "/" + action, data);
  }
  function guestApi(action, params) {
    return api("/api/unterricht/" + action, Object.assign({token:invite, client:client},params || {}));
  }
  function newNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, n => n.toString(16).padStart(2,"0")).join("");
  }
  function waitIce(connection) {
    if (connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        connection.removeEventListener("icegatheringstatechange", check);
        clearTimeout(timer);resolve();
      };
      const check = () => { if (connection.iceGatheringState === "complete") finish(); };
      const timer = setTimeout(finish,12000);
      connection.addEventListener("icegatheringstatechange",check);
    });
  }
  function connection() {
    if (pc) pc.close();
    const next = new RTCPeerConnection({
      iceServers:[{urls:"stun:stun.l.google.com:19302"}],
      bundlePolicy:"max-bundle"
    });
    next.addEventListener("connectionstatechange", () => {
      if (next !== pc || closed) return;
      if (next.connectionState === "connected") notice("Bildschirmübertragung verbunden.");
      if (next.connectionState === "failed") notice(
        "Die direkte Verbindung ist fehlgeschlagen. Über restriktive Netzwerke ist ein TURN-Server erforderlich.",true);
      if (next.connectionState === "disconnected") notice("Verbindung unterbrochen – wird erneut hergestellt …",true);
    });
    pc = next;
    return next;
  }
  function stopLocal() {
    if (display) display.getTracks().forEach(t => t.stop());
    display = null;
    if (pc) pc.close();
    pc = null;
    if (poller) clearInterval(poller);
    poller = null;
  }
  function googleEmbed(url) {
    const match = /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)\//.exec(url || "");
    if (!match) return null;
    return "https://docs.google.com/presentation/d/" + match[1] + "/preview";
  }

  // Moderationswerkzeuge zeichnen im selben Tab, der übertragen wird.
  let tool = "cursor", strokes = [], current = null, laser = null, canvas = null, ctx = null, board = null;
  const position = evt => {
    const r = canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),
            y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))};
  };
  function arrow(ctx,a,b,w,h) {
    const x1=a.x*w,y1=a.y*h,x2=b.x*w,y2=b.y*h;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    const angle=Math.atan2(y2-y1,x2-x1),len=18;
    ctx.beginPath();ctx.moveTo(x2,y2);
    ctx.lineTo(x2-len*Math.cos(angle-0.5),y2-len*Math.sin(angle-0.5));
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-len*Math.cos(angle+0.5),y2-len*Math.sin(angle+0.5));ctx.stroke();
  }
  function paint() {
    if (!canvas || !ctx) return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";
    for(const item of strokes.concat(current?[current]:[])){
      if(item.mode==="pfeil"){
        ctx.strokeStyle="#ffdb4c";arrow(ctx,item.a,item.b||item.a,w,h);
      } else if(item.mode==="stift"){
        ctx.strokeStyle="#47d4f4";
        if(item.points.length>0){
          ctx.beginPath();ctx.moveTo(item.points[0].x*w,item.points[0].y*h);
          for(const p of item.points.slice(1))ctx.lineTo(p.x*w,p.y*h);
          ctx.stroke();
        }
      }
    }
    if(laser){
      const x=laser.x*w,y=laser.y*h;
      ctx.fillStyle="rgba(244,49,67,.15)";ctx.beginPath();ctx.arc(x,y,20,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#ff354b";ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
    }
  }
  function initMarkupTools() {
    board=$("tafel");canvas=$("overlay");ctx=canvas.getContext("2d");
    window.addEventListener("resize",paint);
    canvas.addEventListener("pointerdown",evt=>{
      if(tool==="cursor")return;
      const p=position(evt);
      if(tool==="laser"){laser=p;paint();return;}
      current = tool==="pfeil"?{mode:"pfeil",a:p,b:p}:{mode:"stift",points:[p]};
      canvas.setPointerCapture(evt.pointerId);paint();
    });
    canvas.addEventListener("pointermove",evt=>{
      if(tool==="laser"){laser=position(evt);paint();return;}
      if(!current)return;
      const p=position(evt);
      if(current.mode==="pfeil")current.b=p;
      else if(current.points.length<1500)current.points.push(p);
      paint();
    });
    const up=evt=>{
      if(current){strokes.push(current);current=null;paint();}
      if(canvas.hasPointerCapture(evt.pointerId))canvas.releasePointerCapture(evt.pointerId);
    };
    canvas.addEventListener("pointerup",up);
    canvas.addEventListener("pointercancel",up);
    canvas.addEventListener("pointerleave",()=>{laser=null;paint();});
    document.querySelectorAll("[data-tool]").forEach(btn=>btn.addEventListener("click",()=>{
      tool=btn.dataset.tool;board.dataset.werkzeug=tool;
      laser=null;document.querySelectorAll("[data-tool]").forEach(x=>x.classList.toggle("active",x===btn));
      paint();
    }));
    $("loeschen").addEventListener("click",()=>{strokes=[];current=null;laser=null;paint();});
    paint();
  }
  async function train() {
    $("ausbilder").classList.remove("hidden");
    const info=await trainerApi("details");
    $("titel").textContent=info.modul_code+" · "+info.titel;
    const embed=googleEmbed(info.url);
    $("extern").href=info.url;
    if(embed) $("folie").src=embed;
    else notice("Dieser Link ist keine Google-Slides-Präsentation. Bitte im Hauptpanel prüfen.",true);
    const saved=sessionStorage.getItem("idvLesson:"+room);
    if(saved){
      $("einladung").value=saved;
      $("kopieren").onclick=async()=>{
        try{await navigator.clipboard.writeText(saved);notice("Einladungslink kopiert.");}
        catch{ $("einladung").select();notice("Einladungslink markieren und kopieren.");}
      };
    }else{
      $("einladung").placeholder="Link nur direkt nach Erstellung verfügbar; starte sonst eine neue Sitzung.";
      $("kopieren").disabled=true;
    }
    initMarkupTools();
    notice("Unterricht bereit. Link weitergeben und „Bildschirm freigeben“ auswählen.");
    $("teilen").onclick=async()=>{
      if(display){notice("Der Bildschirm wird bereits übertragen.");return;}
      if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){
        notice("Bildschirmfreigabe wird hier nicht unterstützt. HTTPS und einen aktuellen Desktop-Browser verwenden.",true);
        return;
      }
      try{
        // Aufruf direkt aus dem Klick, damit die Browser-Freigabe erscheinen kann.
        display=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:15},audio:false});
        display.getVideoTracks()[0].addEventListener("ended",()=>{if(!closed){stopLocal();notice("Bildschirmfreigabe beendet. Mit dem Startknopf erneut beginnen.",true);$("teilen").disabled=false;}});
        const peer=connection();
        display.getTracks().forEach(t=>peer.addTrack(t,display));
        const offer=await peer.createOffer();
        await peer.setLocalDescription(offer);await waitIce(peer);
        await trainerApi("angebot",{sdp:peer.localDescription.sdp});
        answered=false;
        $("teilen").disabled=true;
        notice("Bildschirm wird freigegeben. Der Anwärter kann jetzt beitreten.");
        if(poller)clearInterval(poller);
        poller=setInterval(async()=>{
          if(!pc||closed)return;
          try{
            const state=await trainerApi("status");
            if(state.antwort&&!answered){
              answered=true;
              await pc.setRemoteDescription({type:"answer",sdp:state.antwort});
              notice("Anwärter zugeschaltet – Bildschirmübertragung wird verbunden.");
            }else if(!state.teilnehmerAngemeldet){
              notice("Warte auf Anwärter. Einladungslink teilen.");
            }
          }catch(err){notice(err.message,true);}
        },1300);
      }catch(err){
        stopLocal();$("teilen").disabled=false;
        notice("Bildschirmfreigabe konnte nicht gestartet werden: "+err.message,true);
      }
    };
    $("ende").onclick=async()=>{
      if(!confirm("Unterricht für den Anwärter beenden? Der Link wird damit ungültig."))return;
      try{await trainerApi("beenden",{});closed=true;stopLocal();notice("Unterricht beendet.");$("teilen").disabled=true;}
      catch(err){notice(err.message,true);}
    };
  }
  async function watch() {
    $("mitmachen").classList.remove("hidden");
    $("zurueck").classList.add("hidden");
    $("beitreten").onclick=async()=>{
      $("beitreten").disabled=true;
      try{
        const key="idvLessonClient:"+invite.slice(0,16);
        client=sessionStorage.getItem(key)||newNonce();
        sessionStorage.setItem(key,client);
        await guestApi("beitreten");
        joined=true;
        $("zuschauer").classList.remove("hidden");
        $("beitreten").classList.add("hidden");
        notice("Beigetreten. Warte auf die Bildschirmübertragung des Ausbilders.");
        let connecting=false;
        const check=async()=>{
          if(closed||!joined||connecting)return;
          try{
            const state=await guestApi("status");
            if(!state.angebot||pc)return;
            connecting=true;
            const peer=connection();
            peer.addEventListener("track",event=>{
              $("stream").srcObject=event.streams[0]||new MediaStream([event.track]);
              $("stream").play().catch(()=>notice("Zum Starten der Videowiedergabe bitte ins Bild klicken.",true));
            });
            await peer.setRemoteDescription({type:"offer",sdp:state.angebot});
            const answer=await peer.createAnswer();
            await peer.setLocalDescription(answer);await waitIce(peer);
            await guestApi("antwort",{sdp:peer.localDescription.sdp});
            notice("Verbinde mit dem Bildschirm des Ausbilders …");
          }catch(err){
            notice(err.message,true);
            if(pc){pc.close();pc=null;}
          }finally{connecting=false;}
        };
        await check();
        poller=setInterval(check,1400);
      }catch(err){$("beitreten").disabled=false;notice(err.message,true);}
    };
    $("stream").addEventListener("click",()=>$("stream").play().catch(()=>{}));
  }
  if(isTrainer) train().catch(err=>notice("Unterricht kann nicht geladen werden: "+err.message,true));
  else if(isGuest)watch().catch(err=>notice(err.message,true));
  else notice("Dieser Unterrichtslink ist ungültig. Bitte einen neuen Link beim Ausbilder anfordern.",true);
})();
