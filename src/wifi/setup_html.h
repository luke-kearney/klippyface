#ifndef KLIPPYFACE_SETUP_HTML_H
#define KLIPPYFACE_SETUP_HTML_H

#include <Arduino.h>

static const char SETUP_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Klippyface Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.container{background:#16213e;border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.4)}
h1{font-size:22px;text-align:center;margin-bottom:20px;color:#e94560;font-weight:700}
h2{font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.section{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #1a1a2e}
.section:last-of-type{border-bottom:none;margin-bottom:0;padding-bottom:0}
label{display:block;font-size:13px;color:#aaa;margin-bottom:4px}
input,select{width:100%;padding:10px 12px;border:1px solid #333;border-radius:8px;background:#0f3460;color:#eee;font-size:16px;margin-bottom:8px;outline:none;transition:border-color .2s}
input:focus,select:focus{border-color:#e94560}
input::placeholder{color:#666}
.password-wrap{display:flex;gap:8px}
.password-wrap input{flex:1}
.password-wrap button{flex-shrink:0;padding:10px 16px;border-radius:8px;font-size:14px}
.btn{width:100%;padding:12px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .1s}
.btn:active{transform:scale(.98)}
.btn-primary{background:#e94560;color:#fff}
.btn-primary:hover{opacity:.9}
.btn-secondary{background:#333;color:#eee}
.btn-secondary:hover{opacity:.8}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.scan-row{display:flex;gap:8px;margin-bottom:8px}
.scan-row button{flex-shrink:0}
#ssidSelect{display:none}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
#status{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:14px;display:none}
#status.info{display:block;background:#1a3a5c;color:#8cf}
#status.error{display:block;background:#3a1a1a;color:#f88}
#status.success{display:block;background:#1a3a1a;color:#8f8}
</style>
</head>
<body>
<div class="container">
  <h1>Klippyface Setup</h1>

  <div class="section">
    <h2>WiFi Network</h2>
    <div class="scan-row">
      <button class="btn btn-secondary" onclick="scanNetworks()" id="scanBtn">Scan</button>
      <select id="ssidSelect" onchange="selectSsid(this.value)"><option value="">— pick from scan —</option></select>
    </div>
    <input type="text" id="ssid" placeholder="Network name (SSID)" autocomplete="off">
    <div class="password-wrap">
      <input type="password" id="password" placeholder="Password" autocomplete="off">
      <button class="btn btn-secondary" onclick="togglePw()" id="pwToggle">Show</button>
    </div>
  </div>

  <div class="section">
    <h2>Moonraker</h2>
    <input type="text" id="mkHost" placeholder="Host IP (e.g. 192.168.2.21)" autocomplete="off">
    <div style="display:flex;gap:8px;align-items:center">
      <input type="number" id="mkPort" value="7125" placeholder="Port" min="1" max="65535" style="margin-bottom:0">
      <label style="white-space:nowrap;font-size:13px;margin-bottom:0"><input type="checkbox" id="mkTls" onchange="toggleMkTlsVerify()"> WSS</label>
    </div>
    <div id="mkTlsVerifyWrap" style="display:none;margin-top:4px">
      <label style="font-size:12px;color:#888"><input type="checkbox" id="mkTlsVerify"> Verify SSL certificate</label>
    </div>
  </div>

  <div class="section">
    <h2>Companion Server</h2>
    <label style="font-size:13px;color:#aaa;cursor:pointer">
      <input type="checkbox" id="useSeparateServer" onchange="toggleServerSection()">
      Use a different server
    </label>
    <div id="serverSection" style="display:none;margin-top:8px">
      <input type="text" id="svHost" placeholder="Host (e.g. 192.168.2.21)" autocomplete="off">
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="svPort" value="5000" placeholder="Port" min="1" max="65535" style="margin-bottom:0">
        <label style="white-space:nowrap;font-size:13px;margin-bottom:0"><input type="checkbox" id="svTls" onchange="toggleSvTlsVerify()"> HTTPS</label>
      </div>
      <div id="svTlsVerifyWrap" style="display:none;margin-top:4px">
        <label style="font-size:12px;color:#888"><input type="checkbox" id="svTlsVerify"> Verify SSL certificate</label>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Display Name</h2>
    <input type="text" id="friendlyName" placeholder="Optional — e.g. Printer Face" autocomplete="off">
  </div>

  <button class="btn btn-primary" onclick="saveConfig()" id="saveBtn">Save &amp; Reboot</button>
  <div id="status"></div>
</div>

<script>
function byId(id){return document.getElementById(id)}

function togglePw(){
  var p=byId('password'),t=byId('pwToggle')
  if(p.type==='password'){p.type='text';t.textContent='Hide'}
  else{p.type='password';t.textContent='Show'}
}

function selectSsid(val){if(val)byId('ssid').value=val}

function toggleMkTlsVerify(){
  byId('mkTlsVerifyWrap').style.display=byId('mkTls').checked?'block':'none'
}

function toggleServerSection(){
  byId('serverSection').style.display=byId('useSeparateServer').checked?'block':'none'
}

function toggleSvTlsVerify(){
  byId('svTlsVerifyWrap').style.display=byId('svTls').checked?'block':'none'
}

function scanNetworks(){
  var btn=byId('scanBtn'),sel=byId('ssidSelect')
  btn.disabled=true;btn.textContent='Scanning...'
  fetch('/scan').then(function(r){return r.json()}).then(function(nets){
    sel.innerHTML='<option value="">— pick from scan —</option>'
    nets.forEach(function(n){
      var o=document.createElement('option')
      o.value=n.ssid;o.textContent=n.ssid+(n.rssi?' ('+n.rssi+'dBm)':'')
      sel.appendChild(o)
    })
    sel.style.display='block'
    btn.textContent='Rescan'
    btn.disabled=false
  }).catch(function(){
    setStatus('Scan failed','error')
    btn.textContent='Scan'
    btn.disabled=false
  })
}

function saveConfig(){
  var ssid=byId('ssid').value.trim()
  var host=byId('mkHost').value.trim()
  if(!ssid){setStatus('WiFi SSID is required','error');return}
  if(!host){setStatus('Moonraker host is required','error');return}

  var payload={
    ssid:ssid,
    password:byId('password').value,
    mk_host:host,
    mk_port:parseInt(byId('mkPort').value)||7125,
    mk_tls:byId('mkTls').checked,
    mk_tls_verify:byId('mkTlsVerify').checked,
    friendly_name:byId('friendlyName').value.trim()
  }

  if(byId('useSeparateServer').checked){
    payload.sv_host=byId('svHost').value.trim()
    payload.sv_port=parseInt(byId('svPort').value)||5000
    payload.sv_tls=byId('svTls').checked
    payload.sv_tls_verify=byId('svTlsVerify').checked
  }

  var btn=byId('saveBtn')
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Saving...'

  fetch('/save',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).then(function(r){
    if(!r.ok)return r.text().then(function(t){throw new Error(t||'Save failed')})
    setStatus('Saved! Rebooting in 3 seconds...','success')
    setTimeout(function(){window.location.reload()},3500)
  }).catch(function(e){
    setStatus(e.message,'error')
    btn.disabled=false;btn.textContent='Save & Reboot'
  })
}

function setStatus(msg,type){
  var s=byId('status')
  s.textContent=msg;s.className=type
}
</script>
</body>
</html>
)rawliteral";

#endif
