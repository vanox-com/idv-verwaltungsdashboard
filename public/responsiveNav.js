/* Responsive Navigation: unter 1024 px wird die Sidebar zum ausklappbaren Menü (Off-Canvas).
   Nur Darstellung – keine Daten, keine API-Aufrufe. */
(function(){
  var app=document.getElementById('app');
  var btn=document.getElementById('navToggle');
  var side=document.getElementById('appSidebar');
  var backdrop=document.getElementById('navBackdrop');
  if(!app||!btn||!side)return;
  var mq=window.matchMedia('(max-width: 1023.98px)');
  function setOpen(open){
    app.classList.toggle('nav-open',open);
    document.documentElement.classList.toggle('nav-lock',open);
    btn.setAttribute('aria-expanded',open?'true':'false');
    btn.setAttribute('aria-label',open?'Menü schließen':'Menü öffnen');
  }
  btn.addEventListener('click',function(){setOpen(!app.classList.contains('nav-open'));});
  if(backdrop)backdrop.addEventListener('click',function(){setOpen(false);});
  side.addEventListener('click',function(e){
    var t=e.target;
    if(mq.matches&&t&&t.closest&&t.closest('a[data-t]'))setOpen(false);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&app.classList.contains('nav-open')){setOpen(false);btn.focus();}
  });
  var onChange=function(){if(!mq.matches)setOpen(false);};
  if(mq.addEventListener)mq.addEventListener('change',onChange);else if(mq.addListener)mq.addListener(onChange);
})();
