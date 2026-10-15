#ifndef KLIPPYFACE_SETUP_HTML_H
#define KLIPPYFACE_SETUP_HTML_H

#include <Arduino.h>

static const char SETUP_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Klippyface Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:16px}
.container{background:#16213e;border-radius:12px;padding:20px;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.4)}
h1{font-size:22px;text-align:center;margin-bottom:20px;color:#e94560;font-weight:700}
h2{font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.section{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #1a1a2e}
.field{margin-bottom:12px}
.field label{display:block;font-size:14px;color:#ccc;margin-bottom:6px}
.hint{font-size:12px;color:#888;margin-top:6px;line-height:1.4}
input[type=text],input[type=password],input[type=number]{display:block;width:100%;min-width:0;padding:11px 12px;border:1px solid #333;border-radius:8px;background:#0f3460;color:#eee;font-size:16px;outline:none}
input:focus{border-color:#e94560}
input::placeholder{color:#667}
.check{display:flex;align-items:center;gap:8px;font-size:14px;color:#ccc;cursor:pointer}
.check input{width:18px;height:18px;accent-color:#e94560;flex-shrink:0}
.row{display:flex;gap:12px;align-items:flex-end}
.row .grow{flex:1;min-width:0}
.list-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.list-head span{font-size:14px;color:#ccc}
.link{background:none;border:none;color:#e94560;font-size:14px;cursor:pointer;padding:4px 0}
.link:disabled{color:#666;cursor:default}
#networks{border:1px solid #333;border-radius:8px;max-height:220px;overflow-y:auto;margin-bottom:12px}
.net{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;background:none;border:none;border-bottom:1px solid #22284a;color:#eee;font-size:15px;text-align:left;cursor:pointer}
.net:last-child{border-bottom:none}
.net.selected{background:#0f3460}
.net .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.net .lock{font-size:12px;color:#888}
.bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px;flex-shrink:0}
.bars i{display:block;width:3px;background:#444;border-radius:1px}
.bars i.on{background:#8cf}
.empty{padding:12px;font-size:14px;color:#888}
.btn{display:block;width:100%;padding:13px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;background:#e94560;color:#fff}
.btn:disabled{opacity:.5;cursor:not-allowed}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
#status{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:14px;display:none}
#status.error{display:block;background:#3a1a1a;color:#f88}
#status.success{display:block;background:#1a3a1a;color:#8f8}
</style>
</head>
<body>
<div class="container">
  <h1>Klippyface Setup</h1>

  <div class="section">
    <h2>WiFi Network</h2>
    <div class="list-head">
      <span>Nearby networks</span>
      <button class="link" type="button" id="rescan" onclick="scan(true)">Rescan</button>
    </div>
    <div id="networks"><div class="empty"><span class="spinner"></span>Scanning…</div></div>
    <div class="field">
      <label for="ssid">Network name</label>
      <input type="text" id="ssid" placeholder="Pick above or type it" autocomplete="off" autocapitalize="none">
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input type="password" id="password" placeholder="Leave empty for an open network" autocomplete="off">
    </div>
    <label class="check"><input type="checkbox" id="showPw" onchange="byId('password').type=this.checked?'text':'password'"> Show password</label>
  </div>

  <div class="section">
    <h2>Klippyface Server</h2>
    <div class="row field">
      <div class="grow">
        <label for="svHost">Server address</label>
        <input type="text" id="svHost" placeholder="e.g. 192.168.1.50" autocomplete="off" autocapitalize="none" inputmode="url">
      </div>
      <div style="width:96px">
        <label for="svPort">Port</label>
        <input type="number" id="svPort" value="5000" min="1" max="65535">
      </div>
    </div>
    <p class="hint">The IP address of the computer running the Klippyface server (the address you open its web page on). The server connects to your printer; this display gets everything from it.</p>
    <div style="margin-top:12px">
      <label class="check"><input type="checkbox" id="svTls" onchange="byId('svTlsVerifyWrap').style.display=this.checked?'block':'none'"> Use HTTPS</label>
      <div id="svTlsVerifyWrap" style="display:none;margin:10px 0 0 26px">
        <label class="check"><input type="checkbox" id="svTlsVerify"> Verify certificate</label>
      </div>
    </div>
  </div>

  <div class="section" style="border-bottom:none;padding-bottom:0">
    <h2>Display Name</h2>
    <div class="field">
      <label for="friendlyName">Name (optional)</label>
      <input type="text" id="friendlyName" placeholder="e.g. Printer Face" autocomplete="off">
    </div>
  </div>

  <button class="btn" type="button" onclick="saveConfig()" id="saveBtn">Save &amp; Reboot</button>
  <div id="status"></div>
</div>

<script>
function byId(id){return document.getElementById(id)}

var pollTimer=null,pollFailures=0

// The display scans on its own when the portal starts; keep asking until it's done.
// A request can fail while the radio is scanning, so failures just retry a few times.
function scan(refresh){
  clearTimeout(pollTimer)
  byId('rescan').disabled=true
  fetch('/scan'+(refresh?'?refresh=1':'')).then(function(r){return r.json()}).then(function(res){
    pollFailures=0
    showNetworks(res.networks,res.scanning)
    if(res.scanning)pollTimer=setTimeout(function(){scan(false)},1000)
    else byId('rescan').disabled=false
  }).catch(function(){
    if(++pollFailures<=5){pollTimer=setTimeout(function(){scan(false)},1500);return}
    pollFailures=0
    byId('rescan').disabled=false
    if(!byId('networks').querySelector('.net'))byId('networks').innerHTML='<div class="empty">Couldn\'t scan. Tap Rescan, or type the network name below.</div>'
  })
}

function bars(rssi){
  var n=rssi>-55?4:rssi>-67?3:rssi>-75?2:1,html='<span class="bars">'
  for(var i=1;i<=4;i++)html+='<i class="'+(i<=n?'on':'')+'" style="height:'+(i*3+2)+'px"></i>'
  return html+'</span>'
}

function showNetworks(nets,scanning){
  var box=byId('networks')
  if(!nets.length){
    box.innerHTML=scanning?'<div class="empty"><span class="spinner"></span>Scanning…</div>':'<div class="empty">No networks found. Tap Rescan, or type the name below.</div>'
    return
  }
  box.innerHTML=''
  nets.forEach(function(n){
    var b=document.createElement('button')
    b.type='button';b.className='net'+(n.ssid===byId('ssid').value?' selected':'')
    b.innerHTML=bars(n.rssi)+'<span class="name"></span>'+(n.secure?'<span class="lock">secured</span>':'')
    b.querySelector('.name').textContent=n.ssid
    b.onclick=function(){
      byId('ssid').value=n.ssid
      var all=box.querySelectorAll('.net');for(var i=0;i<all.length;i++)all[i].classList.remove('selected')
      b.classList.add('selected')
      if(n.secure)byId('password').focus()
    }
    box.appendChild(b)
  })
}

function saveConfig(){
  var ssid=byId('ssid').value.trim()
  var host=byId('svHost').value.trim()
  if(!ssid){setStatus('Pick or type a WiFi network','error');return}
  if(!host){setStatus('Enter the Klippyface server address','error');return}

  var payload={
    ssid:ssid,
    password:byId('password').value,
    sv_host:host,
    sv_port:parseInt(byId('svPort').value)||5000,
    sv_tls:byId('svTls').checked,
    sv_tls_verify:byId('svTlsVerify').checked,
    friendly_name:byId('friendlyName').value.trim()
  }

  var btn=byId('saveBtn')
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Saving…'

  fetch('/save',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).then(function(r){
    if(!r.ok)return r.text().then(function(t){throw new Error(t||'Save failed')})
    setStatus('Saved. The display is restarting and will join '+ssid+'. You can close this page.','success')
  }).catch(function(e){
    setStatus(e.message,'error')
    btn.disabled=false;btn.textContent='Save & Reboot'
  })
}

function setStatus(msg,type){
  var s=byId('status')
  s.textContent=msg;s.className=type
}

scan(false)
</script>
</body>
</html>
)rawliteral";

#endif
