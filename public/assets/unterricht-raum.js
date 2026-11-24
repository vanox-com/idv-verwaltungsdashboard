/* 1:1 AuLK-Unterricht. Nur die eigene #tafel ist zur Übertragung freigegeben.
 * Der Browser fragt einmal nach Freigabe DIESES Tabs. Danach wird der Videotrack
 * mit Region Capture zwingend auf #tafel beschnitten, BEVOR WebRTC ihn sendet.
 * Ohne unterstütztes CropTarget oder bei falscher Tab-Auswahl: KEIN Livestream.
 * Google Slides sind cross-origin und werden nicht per JS ferngesteuert.
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
  // Die Übertragung darf ausschließlich die eigene Unterrichtstafel zeigen.
  // Sonstiger Bildschirm-/Tabinhalt wird nie über WebRTC verschickt.
  const captureHandle = "idv-folien-" + newNonce();
  let handleConfigured = false;
  function shareState(label,active) {
    const chip=$("sendestatus");
    if(!chip)return;
    chip.textContent=label;
    chip.classList.toggle("waiting",!active);
  }
  function prepareSafeCapture() {
    if(typeof CropTarget==="undefined" || typeof CropTarget.fromElement!=="function" ||
       !navigator.mediaDevices?.getDisplayMedia)return false;
    if(typeof navigator.mediaDevices.setCaptureHandleConfig==="function"){
      try {
        navigator.mediaDevices.setCaptureHandleConfig({
          handle:captureHandle,
          exposeOrigin:false,
          permittedOrigins:["*"]
        });
        handleConfigured=true;
      } catch (_) {
        // Region Capture selbst schützt auch ohne Capture Handle:
        // CropTarget muss zum tatsächlich ausgewählten Tab gehören.
        handleConfigured=false;
      }
    }
    return true;
  }
  async function cropOwnBoard(stream){
    const video=stream.getVideoTracks()[0];
    if(!video || typeof video.cropTo!=="function")
      throw new Error("Dieser Browser kann die Übertragung nicht auf die Folien beschränken. Bitte Chrome oder Edge auf dem Desktop verwenden.");
    if(handleConfigured && typeof video.getCaptureHandle==="function"){
      const captured=video.getCaptureHandle();
      if(!captured || captured.handle!==captureHandle)
        throw new Error("Bitte ausschließlich „Diesen Tab“ auswählen. Die Freigabe eines anderen Tabs oder Bildschirms wird blockiert.");
    }
    const target=await CropTarget.fromElement($("tafel"));
    // Andere Tabs und Monitore lassen sich nicht auf ein DOM-Element DIESES
    // Tabs zuschneiden; der Browser lehnt cropTo() in diesem Fall ab.
    await video.cropTo(target);
    if(video.readyState!=="live")
      throw new Error("Präsentationsübertragung wurde abgebrochen.");
    return video;
  }
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
      if (next.connectionState === "connected") notice("Live-Präsentation verbunden – ausschließlich die Folien werden übertragen.");
      if (next.connectionState === "failed") notice(
        "Die direkte Verbindung ist fehlgeschlagen. Über restriktive Netzwerke ist ein TURN-Server erforderlich.",true);
      if (next.connectionState === "disconnected") notice("Verbindung unterbrochen – wird erneut hergestellt …",true);
    });
    pc = next;
    return next;
  }
  function stopLocal() {
    if(display)display.getTracks().forEach(t=>t.stop());
    display=null;
    if(pc)pc.close();
    pc=null;
    if(poller)clearInterval(poller);
    poller=null;
    shareState("Nicht verbunden",false);
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
      laser=null;
      document.querySelectorAll("[data-tool]").forEach(x=>{
        const active=x===btn;
        x.classList.toggle("active",active);
        x.setAttribute("aria-pressed",String(active));
      });
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
    if(embed)$("folie").src=embed;
    else {
      notice("Die verknüpfte Unterlage ist keine Google-Slides-Präsentation. Bitte im Ausbildungsmonitor korrigieren.",true);
      $("teilen").disabled=true;
      return;
    }
    $("aktualisieren").onclick=()=>{
      strokes=[];current=null;laser=null;paint();
      const fresh=new URL(embed);
      fresh.searchParams.set("idv_reload",String(Date.now()));
      $("folie").src=fresh.href;
      notice("Präsentation wird neu geladen. Änderungen am Google-Original werden nach dem Laden sichtbar.");
    };
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
    const canCrop=prepareSafeCapture();
    if(!canCrop){
      $("teilen").disabled=true;
      notice("Für eine auf Folien begrenzte Übertragung benötigst du Chrome oder Edge mit Region Capture. Eine unbeschränkte Bildschirmfreigabe wird nicht angeboten.",true);
      $("sicherheit").textContent="Sicherheitsfunktion Region Capture nicht verfügbar. Bitte den Unterrichtsraum mit einem aktuellen Desktop-Chrome oder -Edge öffnen.";
    } else {
      shareState("Bereit · nicht live",false);
      notice("Präsentation bereit. Einladungslink kopieren und anschließend den Unterricht starten.");
    }
    $("teilen").onclick=async()=>{
      if(display){notice("Der Bildschirm wird bereits übertragen.");return;}
      if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){
        notice("Bildschirmfreigabe wird hier nicht unterstützt. HTTPS und einen aktuellen Desktop-Browser verwenden.",true);
        return;
      }
      try{
        // Der Browser verlangt aus Datenschutzgründen immer eine explizite
        // Freigabe. Bereits im Dialog möglichst „Diesen Tab“ auswählen.
        display=await navigator.mediaDevices.getDisplayMedia({
          video:{displaySurface:"browser",frameRate:{ideal:15,max:20}},
          audio:false,
          preferCurrentTab:true,
          selfBrowserSurface:"include",
          monitorTypeSurfaces:"exclude",
          surfaceSwitching:"exclude"
        });
        const video=display.getVideoTracks()[0];
        video.addEventListener("ended",()=>{
          if(!closed){
            stopLocal();
            notice("Freigabe beendet. Du kannst die Präsentation erneut starten.",true);
            $("teilen").disabled=false;
          }
        });
        // WICHTIG: Zuschnitt erfolgt VOR addTrack und VOR SDP-Austausch.
        // Bei Fehlwahl oder ohne CropTarget sieht der Anwärter gar nichts.
        await cropOwnBoard(display);
        const peer=connection();
        peer.addTrack(video,display);
        const offer=await peer.createOffer();
        await peer.setLocalDescription(offer);await waitIce(peer);
        await trainerApi("angebot",{sdp:peer.localDescription.sdp});
        answered=false;
        $("teilen").disabled=true;
        shareState("Live · nur Folien",true);
        notice("Die Präsentation wird live übertragen – ausschließlich die Folientafel samt Moderationswerkzeugen. Dein restlicher Bildschirm bleibt privat.");
        if(poller)clearInterval(poller);
        poller=setInterval(async()=>{
          if(!pc||closed)return;
          try{
            const state=await trainerApi("status");
            if(state.antwort&&!answered){
              answered=true;
              await pc.setRemoteDescription({type:"answer",sdp:state.antwort});
              notice("Anwärter zugeschaltet. Die Live-Präsentation wird verbunden.");
            }else if(!state.teilnehmerAngemeldet){
              notice("Die Folientafel ist freigegeben. Warte auf den Anwärter.");
            }
          }catch(err){notice(err.message,true);}
        },1300);
      }catch(err){
        stopLocal();$("teilen").disabled=false;
        notice("Sichere Folienübertragung nicht gestartet: "+err.message,true);
      }
    };
    $("ende").onclick=async()=>{
      if(!confirm("Unterricht für den Anwärter beenden? Der Link wird damit ungültig."))return;
      try{await trainerApi("beenden",{});closed=true;stopLocal();shareState("Unterricht beendet",false);notice("Unterricht beendet.");$("teilen").disabled=true;}
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
        notice("Beigetreten. Warte auf die Live-Präsentation des Ausbilders.");
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
            notice("Verbinde mit der Live-Präsentation …");
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
