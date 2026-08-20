from pathlib import Path

p = Path("index.html")
s = p.read_text()

if "Rky Chat Call History v1" in s:
    print("⚠️ Call History already added.")
    raise SystemExit

# UI
marker = '<div id="voiceCallControls"'

ui = r'''
<!-- 📋 Rky Chat Call History v1 -->
<div id="callHistoryPanel"
style="margin:10px 0; padding:12px; background:#f2f2f2; border-radius:10px;">

    <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>📋 Call History</strong>

        <button
            type="button"
            onclick="clearCallHistory()">
            🗑️ Clear
        </button>
    </div>

    <div id="callHistoryList"
         style="margin-top:10px;">
        No calls yet.
    </div>

</div>

'''

if marker in s:
    s = s.replace(marker, ui + marker, 1)
else:
    print("❌ Voice Call Controls not found.")
    raise SystemExit(1)

# JS
js_marker = "/* 📞 Rky Chat Voice Call */"

js = r'''
/* 📋 Rky Chat Call History v1 */

function getCallHistory(){

    try{

        return JSON.parse(
            localStorage.getItem("rkyCallHistory") || "[]"
        );

    }catch(error){

        console.error("Call history read error:", error);
        return [];

    }
}

function saveCallHistory(){

    localStorage.setItem(
        "rkyCallHistory",
        JSON.stringify(getCallHistory())
    );

}

function addCallHistory(type, user, duration){

    if(!currentUser || !user){
        return;
    }

    const history = getCallHistory();

    history.unshift({
        id: Date.now(),
        username: currentUser,
        user: user,
        type: type,
        duration: duration || "00:00",
        time: new Date().toLocaleString()
    });

    if(history.length > 100){
        history.length = 100;
    }

    localStorage.setItem(
        "rkyCallHistory",
        JSON.stringify(history)
    );

    loadCallHistory();
}

function formatCallType(type){

    if(type === "outgoing"){
        return "📞 Outgoing";
    }

    if(type === "incoming"){
        return "📲 Incoming";
    }

    if(type === "missed"){
        return "❌ Missed";
    }

    if(type === "rejected"){
        return "🚫 Rejected";
    }

    return "📞 Call";
}

function loadCallHistory(){

    const box =
        document.getElementById("callHistoryList");

    if(!box){
        return;
    }

    const history = getCallHistory()
        .filter(function(item){
            return item.username === currentUser;
        });

    if(history.length === 0){

        box.innerHTML =
            '<div style="opacity:.7;">No calls yet.</div>';

        return;
    }

    box.innerHTML = history.map(function(item){

        const safeUser =
            String(item.user)
                .replace(/&/g,"&amp;")
                .replace(/</g,"&lt;")
                .replace(/>/g,"&gt;")
                .replace(/"/g,"&quot;");

        return `
        <div
            style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                padding:9px;
                margin:5px 0;
                background:white;
                border-radius:8px;
            ">

            <div>
                <strong>${safeUser}</strong>
                <div style="font-size:12px; opacity:.7;">
                    ${formatCallType(item.type)}
                    • ${item.duration}
                    • ${item.time}
                </div>
            </div>

            <button
                type="button"
                onclick="callHistoryBack('${safeUser}')">
                🔁
            </button>

        </div>`;
    }).join("");
}

function callHistoryBack(user){

    if(!user){
        return;
    }

    if(typeof selectFriend === "function"){
        selectFriend(user);
    }

    setTimeout(function(){

        if(typeof startVoiceCall === "function"){
            startVoiceCall();
        }

    }, 300);
}

function clearCallHistory(){

    if(!confirm("Clear all call history?")){
        return;
    }

    localStorage.removeItem("rkyCallHistory");

    loadCallHistory();
}

document.addEventListener(
    "DOMContentLoaded",
    function(){

        setTimeout(
            loadCallHistory,
            500
        );

    }
);

'''

if js_marker in s:
    s = s.replace(js_marker, js + js_marker, 1)
else:
    print("❌ Voice Call JS marker not found.")
    raise SystemExit(1)

p.write_text(s)

print("✅ Call History UI + storage added")
