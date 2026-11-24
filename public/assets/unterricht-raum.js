/* 1:1 AuLK-Unterricht. Nur die eigene #tafel ist zur Übertragung freigegeben.
 * Der Browser fragt einmal nach Freigabe DIESES Tabs. Danach wird der Videotrack
 * mit Element Capture (oder sicherem Region Capture) auf #tafel begrenzt,
 * BEVOR WebRTC ihn sendet. Ohne Zuschnitt: KEIN Livestream.
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
    const element=typeof RestrictionTarget!=="undefined" && typeof RestrictionTarget.fromElement==="function";
    const region=typeof CropTarget!=="undefined" && typeof CropTarget.fromElement==="function";
    if((!element&&!region)||!navigator.mediaDevices?.getDisplayMedia)return false;
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
  // Die Seite bleibt scrollbar. Nur die Tafel mit ihrer lokalen Werkzeugleiste
  // ist sticky; keine body-/main-Scroll-Sperre und kein abgeschnittenes Menü.
  function pinPresentation(){
    document.body.classList.add("presentation-locked");
    $("tafel").closest(".workspace").scrollIntoView({block:"start",behavior:"instant"});
    paint();
    const area=$("tafel").getBoundingClientRect();
    if(area.width<320 || area.height<180 || area.top<0 ||
       area.bottom>window.innerHeight+2)
      throw new Error("Das Präsentationsfenster passt nicht vollständig ins Browserfenster. Bitte Browser maximieren oder den Zoom reduzieren.");
  }
  function unpinPresentation(){
    document.body.classList.remove("presentation-locked");
    paint();
  }
  // Folien brauchen Pixel statt hoher Bildrate. Die Einstellungen sind Ziele;
  // Browser, echte Quellauflösung und Verbindung bestimmen das Ergebnis.
  async function optimizeSlides(sender,video){
    try{video.contentHint="text";if(video.contentHint!=="text")video.contentHint="detail";}catch(_){/* optional */}
    if(!sender || typeof sender.getParameters!=="function" ||
       typeof sender.setParameters!=="function")return;
    try{
      const params=sender.getParameters();
      if(!params.encodings?.length)return;
      for(const encoding of params.encodings){
        encoding.maxBitrate=12000000;
        encoding.scaleResolutionDownBy=1;
        encoding.maxFramerate=15;
      }
      params.degradationPreference="maintain-resolution";
      await sender.setParameters(params);
    }catch(_){
      // Manche Browser unterstützen die Degradation-Präferenz nicht.
      // In diesem Fall wenigstens das höhere Bitratenbudget versuchen.
      try{
        const params=sender.getParameters();
        if(params.encodings?.length){
          params.encodings[0].maxBitrate=12000000;
          await sender.setParameters(params);
        }
      }catch(_){/* Browser entscheidet selbst; Zuschnitt bleibt aktiv. */}
    }
  }
  async function cropOwnBoard(stream){
    const video=stream.getVideoTracks()[0];
    if(!video || (typeof video.restrictTo!=="function" && typeof video.cropTo!=="function"))
      throw new Error("Dieser Browser kann die Übertragung nicht auf die Folien beschränken. Bitte Chrome oder Edge auf dem Desktop verwenden.");
    if(handleConfigured && typeof video.getCaptureHandle==="function"){
      const captured=video.getCaptureHandle();
      if(!captured || captured.handle!==captureHandle)
        throw new Error("Bitte ausschließlich „Diesen Tab“ auswählen. Die Freigabe eines anderen Tabs oder Bildschirms wird blockiert.");
    }
    let restricted=false;
    // Element Capture isoliert den DOM-Unterbaum einschließlich iframe
    // und Zeichen-Canvas, selbst wenn andere Seitenelemente darüberliegen.
    if(typeof RestrictionTarget!=="undefined" && typeof video.restrictTo==="function"){
      try{
        await video.restrictTo(await RestrictionTarget.fromElement($("tafel")));
        restricted=true;
      }catch(_){/* Ältere Browser: sicherer Zuschnitt auf dieselbe Tafel. */}
    }
    if(!restricted){
      if(typeof CropTarget==="undefined" || typeof video.cropTo!=="function")
        throw new Error("Die Folientafel kann nicht sicher isoliert werden.");
      await video.cropTo(await CropTarget.fromElement($("tafel")));
    }
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
    unpinPresentation();
    const info=$("fokusInfo");
    if(info)info.textContent="Nur die 16:9-Folientafel wird übertragen.";
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
    if(typeof ResizeObserver!=="undefined")new ResizeObserver(paint).observe(board);
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
      notice("Für eine auf Folien begrenzte Übertragung benötigst du aktuelles Desktop-Chrome oder -Edge mit Element oder Region Capture. Eine unbeschränkte Bildschirmfreigabe wird nicht angeboten.",true);
      $("sicherheit").textContent="Sicherer Folien-Zuschnitt nicht verfügbar. Bitte aktuelles Desktop-Chrome oder -Edge verwenden.";
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
        // VOR Freigabe und Zuschnitt Folienfläche fest positionieren.
        // Die Seite bleibt scrollbar; die Tafel bleibt im sichtbaren Bereich.
        pinPresentation();
        display=await navigator.mediaDevices.getDisplayMedia({
          video:{displaySurface:"browser",width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:15,max:15}},
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
        try{video.contentHint="text";}catch(_){}
        const sender=peer.addTrack(video,display);
        await optimizeSlides(sender,video);
        const offer=await peer.createOffer();
        await peer.setLocalDescription(offer);
        await optimizeSlides(sender,video);
        await waitIce(peer);
        await trainerApi("angebot",{sdp:peer.localDescription.sdp});
        answered=false;
        $("teilen").disabled=true;
        shareState("Live · fixierte Folien",true);
        $("fokusInfo").textContent="Tafel bleibt sichtbar · Seite scrollbar · Werkzeuge direkt darunter";
        notice("Live-Präsentation gestartet: Die Folientafel bleibt fest stehen; andere Tabs und der Desktop werden nicht übertragen.");
        if(poller)clearInterval(poller);
        poller=setInterval(async()=>{
          if(!pc||closed)return;
          try{
            const state=await trainerApi("status");
            if(state.antwort&&!answered){
              answered=true;
              await peer.setRemoteDescription({type:"answer",sdp:state.antwort});
              await optimizeSlides(sender,video);
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
    const player=$("stream"), quality=$("empfangsqualitaet"), fullscreen=$("vollbild");
    const updateQuality=()=>{
      quality.textContent=player.videoWidth&&player.videoHeight
        ? "Empfang: "+player.videoWidth+" × "+player.videoHeight+" Pixel"
        : "Warte auf Bildsignal";
    };
    player.addEventListener("loadedmetadata",updateQuality);
    player.addEventListener("resize",updateQuality);
    player.addEventListener("click",()=>player.play().catch(()=>{}));
    fullscreen.disabled=typeof player.requestFullscreen!=="function"||!document.fullscreenEnabled;
    fullscreen.onclick=async()=>{
      try{
        if(document.fullscreenElement)await document.exitFullscreen();
        else await player.requestFullscreen();
      }catch(_){notice("Vollbild konnte nicht geöffnet werden.",true);}
    };
  }
  if(isTrainer) train().catch(err=>notice("Unterricht kann nicht geladen werden: "+err.message,true));
  else if(isGuest)watch().catch(err=>notice(err.message,true));
  else notice("Dieser Unterrichtslink ist ungültig. Bitte einen neuen Link beim Ausbilder anfordern.",true);
})();
