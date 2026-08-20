   
  let currentUser =
localStorage.getItem("currentUser") || "";

let users =
JSON.parse(localStorage.getItem("users")) || [];

let videoDB;
let voiceDB;

let replyMessageId = null;
let selectedFriend = "";

let videoRequest = indexedDB.open("RkyChatVideoDB", 1);

videoRequest.onupgradeneeded = function(event){

    videoDB = event.target.result;

    if(!videoDB.objectStoreNames.contains("videos")){

        videoDB.createObjectStore("videos", {
            keyPath: "id"
        });

    }

};

videoRequest.onsuccess = function(event){
    videoDB = event.target.result;
    console.log("Video Database Ready");
};

videoRequest.onerror = function(){
    console.log("Video Database Error");
};

let voiceRequest = indexedDB.open("RkyChatVoiceDB", 1);

voiceRequest.onupgradeneeded = function(event){
    voiceDB = event.target.result;

    if(!voiceDB.objectStoreNames.contains("voices")){
        voiceDB.createObjectStore("voices", {
            keyPath: "id"
        });
    }
};

voiceRequest.onsuccess = function(event){
    voiceDB = event.target.result;
    console.log("Voice Database Ready");
};

voiceRequest.onerror = function(){
    console.log("Voice Database Error");
};
      
  // 🟢 Keep Online Status Updated
setInterval(function(){

    if(currentUser == ""){
        return;
    }

    let savedUsers =
        JSON.parse(localStorage.getItem("users")) || [];

    for(let i = 0; i < savedUsers.length; i++){

        if(savedUsers[i].username == currentUser){

            savedUsers[i].status = "Online";
            savedUsers[i].lastSeen = "";

            break;
        }

    }

    localStorage.setItem(
        "users",
        JSON.stringify(savedUsers)
    );

}, 5000);

function getChatKey(){

let users = [currentUser, selectedFriend];

users.sort();

return users[0] + "_" + users[1];

}
  
  function changePhoto(){

let file = document.getElementById("photo").files[0];

if(!file){
    return;
}

let reader = new FileReader();

reader.onload = function(){

// Profile मा तुरुन्त देखाउने
document.getElementById("profile").src = reader.result;


// Current user को photo save गर्ने
for(let i=0; i<users.length; i++){

if(users[i].username == currentUser){

users[i].photo = reader.result;

// LocalStorage मा save गर्ने
localStorage.setItem(
"users",
JSON.stringify(users)
);


alert("Photo Updated");

}


reader.readAsDataURL(file);

}
async function loadFriends(){

    const list = document.getElementById("friendList");

    if(!list || !currentUser){
        return;
    }

    list.innerHTML = "<p>Loading friends...</p>";

    try{

        const response = await fetch(
            "/api/friends/" +
            encodeURIComponent(currentUser) +
            "?t=" + Date.now()
        );

        if(!response.ok){
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        list.innerHTML = "";

        if(!data.success){
            list.innerHTML = "<p>Could not load friends.</p>";
            return;
        }

        if(!Array.isArray(data.friends) || data.friends.length === 0){
            list.innerHTML = "<p>No friends yet.</p>";
            return;
        }

        data.friends.forEach(function(friend){

            const button = document.createElement("button");

            button.type = "button";

            button.innerText =
                "👤 " + (friend.profileName || friend.username);

            button.onclick = function(){
                selectFriend(friend.username);
            };

            button.style.display = "block";
            button.style.width = "100%";
            button.style.margin = "5px 0";
            button.style.padding = "10px";

            list.appendChild(button);
        });

    }catch(error){

        console.error("loadFriends error:", error);

        list.innerHTML =
            "<p>Could not load friends.</p>";
    }
}

   
function selectFriend(name){

selectedFriend = name;
for(let i=0;i<users.length;i++){

if(users[i].username==currentUser){

if(users[i].notifications){

users[i].notifications[name]=0;

}

}

}

localStorage.setItem(
"users",
JSON.stringify(users)
);

// पुरानो reply बन्द गर्ने
replyMessageId = null;

document.getElementById("replyBox").style.display = "none";
document.getElementById("replyText").innerHTML = "";
document.getElementById("message").value = "";

document.getElementById("messages").innerHTML = "";

let photo = "https://via.placeholder.com/80";
let profileName = name;
let status = "🔴 Offline";

for(let i=0; i<users.length; i++){

if(users[i].username == name){

if(users[i].photo){
photo = users[i].photo;
}

if(users[i].profileName){
profileName = users[i].profileName;
}

if(users[i].status == "Online"){
status = "🟢 Online";
}
else{
status = "🔴 Offline";

if(users[i].lastSeen){
status += "<br>Last Seen: "+users[i].lastSeen;
}

}

}

}

document.getElementById("friendProfile").innerHTML =

"<div style='background:#eee; padding:10px; border-radius:10px;'>"+

"<img src='"+photo+"' width='120' height='120' style='border-radius:50%; object-fit:cover; border:3px solid #2196f3;'>"+

"<h3>"+profileName+"</h3>"+

"<p>"+status+"</p>"+

"<button onclick='closeFriendProfile()'>Close</button>"+

"</div>";

loadMessages();
loadFriends();

}
async function login(){
    let user = document.getElementById("username").value.trim();
    let password = document.getElementById("password").value;

    if(user == "" || password == ""){
        alert("Enter username and password");
        return;
    }

    try{
        let response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: user,
                password: password
            })
        });

        let data = await response.json();

        if(!data.success){
            alert(data.message || "Login Failed");
            return;
        }

        currentUser = data.user.username;
        localStorage.setItem("currentUser", currentUser);

        let serverUser = {
            username: data.user.username,
            password: password,
            profileName: data.user.profile_name || data.user.username,
            photo: data.user.photo || "",
            status: "Online",
            lastSeen: ""
        };

        let savedUsers =
            JSON.parse(localStorage.getItem("users")) || [];

        let userFound = false;

        for(let i = 0; i < savedUsers.length; i++){
            if(savedUsers[i].username == currentUser){
                savedUsers[i].password = password;
                savedUsers[i].profileName = serverUser.profileName;
                savedUsers[i].photo = serverUser.photo;
                savedUsers[i].status = "Online";
                savedUsers[i].lastSeen = "";
                userFound = true;
                break;
            }
        }

        if(!userFound){
            savedUsers.push(serverUser);
        }

        localStorage.setItem(
            "users",
            JSON.stringify(savedUsers)
        );

        document.getElementById("loginBox").style.display = "none";
        document.getElementById("chatBox").style.display = "block";

        document.getElementById("username").value = "";
        document.getElementById("password").value = "";

        document.getElementById("status").innerHTML =
            currentUser + " is Online 🟢";

        document.getElementById("userName").innerHTML =
            "User: " + serverUser.profileName;

        if(serverUser.photo){
            document.getElementById("profile").src =
                serverUser.photo;
        }else{
            document.getElementById("profile").src =
                "https://via.placeholder.com/80";
        }

        alert("Login Success");

        loadMessages();
        loadFriends();

        setTimeout(function(){
            loadRequests();
        }, 500);

    }catch(error){
        console.error("Login error:", error);
        alert("Server connection failed");
    }
}

function register(){

    let user = document.getElementById("username").value;
    let password = document.getElementById("password").value;

    if(user==""){
        alert("Enter Username");
        return;
    }

    if(password==""){
        alert("Enter Password");
        return;
    }

    
let exist = false;

for(let i=0; i<users.length; i++){

    if(users[i].username == user){

        exist = true;
    }

}

if(exist){

    alert("Username already exists");

}
else{

    let profileName = prompt("Enter your name");

if(profileName == "" || profileName == null){

profileName = user;

}
users.push({
    username: user,
    password: password,
    profileName: profileName,
    photo: "",
    friends: [],
requests: [],
notifications: {},
status: "Offline",
lastSeen: ""
});
localStorage.setItem("users",
JSON.stringify(users));
    alert("Register Success");

}
    
}
let mediaRecorder = null;
let voiceChunks = [];

function startVoiceRecording(){
    if(mediaRecorder && mediaRecorder.state === "recording"){
        mediaRecorder.stop();
        return;
    }

    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
        voiceChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = function(e){
            voiceChunks.push(e.data);
        };

        mediaRecorder.onstop = function(){
            let blob = new Blob(voiceChunks, {type:"audio/webm"});
let voiceId = currentUser + "_" + selectedFriend + "_" + Date.now();

if(!voiceDB){
    alert("Voice database is not ready.");
    return;
}

let voiceTransaction = voiceDB.transaction(["voices"], "readwrite");
let voiceStore = voiceTransaction.objectStore("voices");

voiceStore.put({
    id: voiceId,
    from: currentUser,
    to: selectedFriend,
    file: blob,
    time: new Date().toLocaleString()
});
let chats = JSON.parse(localStorage.getItem("chats")) || [];

chats.push({
    id: Date.now(),
    from: currentUser,
    to: selectedFriend,
    message: "",
    photo: "",
    video: "",
    voice: voiceId,
    time: new Date().toLocaleString(),
    seen: false,
    replyTo: null,
    reaction: "",
    pinned: false,
    starred: false
});

localStorage.setItem("chats", JSON.stringify(chats));
            let audio = document.createElement("audio");

            audio.controls = true;
            audio.src = URL.createObjectURL(blob);

            document.getElementById("messages").appendChild(audio);

            stream.getTracks().forEach(function(track){
                track.stop();
            });

            mediaRecorder = null;
document.querySelector('button[onclick="startVoiceRecording()"]').innerText = "🎤 Voice";
        };

        mediaRecorder.start();
 document.querySelector('button[onclick="startVoiceRecording()"]').innerText = "🔴 Recording...";

    }).catch(function(){
        alert("Microphone permission denied.");
    });
}
async function sendmessage(){

    if(selectedFriend == ""){
        alert("Please select a friend");
        return;
    }

    let msg = document.getElementById("message").value.trim();

    if(msg == ""){
        return;
    }

    try{

        const response = await fetch("/api/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sender: currentUser,
                receiver: selectedFriend,
                message: msg
            })
        });

        const data = await response.json();

        if(!data.success){

            alert(data.message || "Message failed");
            return;
        }

        console.log("Message saved on server:", data.messageId);

        // Clear message box
        document.getElementById("message").value = "";
        document.getElementById("typing").innerHTML = "";

        // Reply reset
        replyMessageId = null;
        document.getElementById("replyBox").style.display = "none";
        document.getElementById("replyText").innerHTML = "";

        // Reload current chat
        loadMessages();

    }catch(error){

        console.error("Send message error:", error);

        alert("Server connection failed");
    }
}
function showMessageNotification(sender, message){

    let oldNotification =
    document.getElementById("messageNotification");

    if(oldNotification){
        oldNotification.remove();
    }

    let notification =
    document.createElement("div");

    notification.id = "messageNotification";

    notification.style.position = "fixed";
    notification.style.top = "20px";
    notification.style.right = "20px";
    notification.style.background = "white";
    notification.style.padding = "15px";
    notification.style.borderRadius = "12px";
    notification.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
    notification.style.zIndex = "99999";
    notification.style.maxWidth = "280px";
    notification.style.textAlign = "left";

    notification.innerHTML =
    "<b>🔔 New Message</b><br><br>"+
    "<b>"+escapeHTML(getProfileName(sender))+"</b><br>"+
    escapeHTML(message || "📷 Media")+
    "<br><br>"+
    "<button onclick=\"openNotificationChat('"+
    escapeHTML(sender)+
    "')\">Open Chat</button>"+
    "<button onclick=\"this.parentElement.remove()\">✖</button>";

    document.body.appendChild(notification);

    setTimeout(function(){

        let box =
        document.getElementById("messageNotification");

        if(box){
            box.remove();
        }

    },5000);

}


function openNotificationChat(sender){

    let box =
    document.getElementById("messageNotification");

    if(box){
        box.remove();
    }

    selectFriend(sender);

}
async function loadMessages(){
let chats = [];

try {

    if(!currentUser || !selectedFriend){
        document.getElementById("messages").innerHTML = "";
        return;
    }

    const response = await fetch(
        "/api/messages/" +
        encodeURIComponent(currentUser) +
        "/" +
        encodeURIComponent(selectedFriend) +
        "?t=" + Date.now()
    );

    const data = await response.json();

    if(!data.success){
        console.error("Message loading failed:", data.message);
        return;
    }

    chats = data.messages.map(function(msg){

        return {
            id: msg.id,
            from: msg.sender,
            to: msg.receiver,
            message: msg.message || "",
            photo: msg.photo || null,
            video: msg.video || null,
            voice: msg.voice || null,
            time: msg.time,
            seen: !!msg.seen,
            delivered: !!msg.delivered,
            replyTo: msg.reply_to,
            reaction: msg.reaction || "",
            pinned: !!msg.pinned,
            starred: !!msg.starred
        };

    });
if(currentUser && selectedFriend){
console.log("SEEN SYNC:", currentUser, selectedFriend);

    try{
console.log("CALLING SEEN API");

        await fetch("/api/messages/seen", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: currentUser,
                friend: selectedFriend
            })
        });

        // Server बाट फेरि messages load गरेर
        // updated seen status प्राप्त गर्ने
        const seenResponse = await fetch(
            "/api/messages/" +
            encodeURIComponent(currentUser) +
            "/" +
            encodeURIComponent(selectedFriend) +
            "?t=" + Date.now()
        );

        const seenData = await seenResponse.json();

        if(seenData.success){

            chats = seenData.messages.map(function(msg){

                return {
                    id: msg.id,
                    from: msg.sender,
                    to: msg.receiver,
                    message: msg.message || "",
                    photo: msg.photo || null,
                    video: msg.video || null,
                    voice: msg.voice || null,
                    time: msg.time,
                    seen: !!msg.seen,
                    delivered: !!msg.delivered,
                    replyTo: msg.reply_to,
                    reaction: msg.reaction || "",
                    pinned: !!msg.pinned,
                    starred: !!msg.starred
                };

            });

        }

    }catch(error){

        console.error("Seen sync error:", error);

    }
}

    // Server data लाई local cache मा पनि राख्ने
    let allChats =
        JSON.parse(localStorage.getItem("chats")) || [];

    // यही current chat को पुरानो cache हटाउने
    allChats = allChats.filter(function(chat){

        return !(
            (chat.from == currentUser &&
             chat.to == selectedFriend) ||

            (chat.from == selectedFriend &&
             chat.to == currentUser)
        );

    });

    // Server बाट आएको current chat राख्ने
    allChats = allChats.concat(chats);

    localStorage.setItem(
        "chats",
        JSON.stringify(allChats)
    );

} catch(error) {

    console.error("Load messages error:", error);

    document.getElementById("messages").innerHTML =
        "<p>Server connection failed.</p>";

    return;
}

for(let i=0; i<chats.length; i++){

    // Receiver को chat खोल्दा message delivered हुन्छ
    if(
        chats[i].to == currentUser &&
        chats[i].from == selectedFriend
    ){

        chats[i].delivered = true;
        chats[i].seen = true;

document.getElementById("messages").innerHTML = "";
for(let i=0; i<chats.length; i++){

if(
(chats[i].from == currentUser && chats[i].to == selectedFriend) ||
(chats[i].from == selectedFriend && chats[i].to == currentUser)
){

let className =
chats[i].from == currentUser
? "myMessage"
: "otherMessage";

let seenText = "";

if(chats[i].from == currentUser){

    if(chats[i].seen){

        seenText = " ✓✓ Seen";

    }
    else if(chats[i].delivered){

        seenText = " ✓✓ Delivered";

    }
    else{

        seenText = " ✓ Sent";

    }

}


/* Reply preview */

let replyHTML = "";

if(chats[i].replyTo){

for(let j=0; j<chats.length; j++){

if(chats[j].id == chats[i].replyTo){

replyHTML =
"<div style=\"background:#ddd; padding:6px; border-left:4px solid #2196f3; margin-bottom:6px; border-radius:6px;\">"+
"<b>↩️ "+getProfileName(chats[j].from)+"</b><br>"+
(
chats[j].video
? "<span>🎥 Video</span>"
: chats[j].photo
? "<span>📷 Photo</span>"
: "<span>"+escapeHTML(chats[j].message || "")+"</span>"
)+
"</div>";

break;

}

}

}


/* Message content */

let contentHTML = "";

if(chats[i].video){

contentHTML =
"<b>"+getProfileName(chats[i].from)+"</b><br>"+
"<video controls playsinline data-video-id='"+chats[i].video+"' "+
"style=\"max-width:250px; max-height:300px; width:100%; border-radius:10px; margin:5px auto; display:block; background:#000;\">"+
"Your browser does not support video."+
"</video>";

}
else if(chats[i].photo){

contentHTML =
"<b>"+getProfileName(chats[i].from)+"</b><br>"+
"<img src='"+chats[i].photo+"' "+
"style=\"max-width:200px; max-height:250px; border-radius:10px; display:block; margin:5px auto;\">";

}
else{

contentHTML =
getProfileName(chats[i].from)+": "+
escapeHTML(chats[i].message || "");

}


/* Message HTML */

let messageHTML =
"<p class='"+className+"' onclick=\"showActions("+chats[i].id+")\">"+

replyHTML+

(
chats[i].pinned
?
"<div style=\"font-size:12px; font-weight:bold;\">📌 Pinned</div>"
:
""
)+

(
chats[i].starred
?
"<div style=\"font-size:12px; font-weight:bold;\">⭐ Starred</div>"
:
""
)+

contentHTML+

"<br>"+

formatMessageTime(chats[i].time)+
seenText+

(
chats[i].reaction
?
"<br><span style=\"font-size:20px;\">"+
chats[i].reaction+
"</span>"
:
""
)+

"<div class='messageActions' id='actions_"+chats[i].id+"'>"+

"<button onclick=\"event.stopPropagation(); replyToMessage("+chats[i].id+")\">Reply</button>"+

"<button onclick=\"event.stopPropagation(); copyMessage("+chats[i].id+")\">Copy</button>"+

"<button onclick=\"event.stopPropagation(); pinMessage("+chats[i].id+")\">📌 Pin</button>"+

"<button onclick=\"event.stopPropagation(); starMessage("+chats[i].id+")\">⭐ Star</button>"+

"<button onclick=\"event.stopPropagation(); reactToMessage("+chats[i].id+")\">❤️ React</button>"+

"<button onclick=\"event.stopPropagation(); forwardMessage("+chats[i].id+")\">Forward</button>"+

(
chats[i].from == currentUser
?
"<button onclick=\"event.stopPropagation(); editMessage("+chats[i].id+")\">Edit</button>"+
"<button onclick=\"event.stopPropagation(); deleteOne("+chats[i].id+")\">Delete</button>"
:
""
)+

"</div>"+

"</p>";

document.getElementById("messages").innerHTML += messageHTML;

}

}


/* Scroll */

document.getElementById("messages").scrollTop =
document.getElementById("messages").scrollHeight;


/* Load videos */

loadChatVideos();

}

function replyToMessage(id){

let chats = JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

replyMessageId = id;

document.getElementById("replyBox").style.display = "block";

let replyContent = "";

if(chats[i].photo){

replyContent =
"📷 Photo";

}
else{

replyContent =
escapeHTML(chats[i].message);

}

document.getElementById("replyText").innerHTML =
getProfileName(chats[i].from) +
": " +
replyContent;

document.getElementById("message").focus();

break;

}

}

}
function cancelReply(){

replyMessageId = null;

document.getElementById("replyBox").style.display = "none";

document.getElementById("replyText").innerHTML = "";

}
function checkFriendEnter(event){

  if(event.key=="Enter"){

    friendMessage();

  }

}
function typing(){

if(currentUser==""){
return;
}

document.getElementById("typing").innerHTML =
currentUser+" is typing...";

setTimeout(function(){
document.getElementById("typing").innerHTML="";
},3000);

}
function addEmoji(emoji){

  document.getElementById("message").value += emoji;
}

function deletemessage(){

let chats = JSON.parse(localStorage.getItem("chats")) || [];

chats = chats.filter(function(chat){

return !(chat.from == currentUser && chat.to == selectedFriend);

});

localStorage.setItem("chats", JSON.stringify(chats));

loadMessages();

}
function deleteOne(id){

let chats = JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

if(chats[i].from != currentUser){

alert("You can delete only your message");
return;

}

// Delete गर्नु अघि confirmation
let confirmDelete =
confirm("Are you sure you want to delete this message?");

if(!confirmDelete){

return;

}

chats.splice(i,1);

break;

}

}

localStorage.setItem(
"chats",
JSON.stringify(chats)
);

loadMessages();

}
function editMessage(id){

let chats = JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

if(chats[i].from != currentUser){

alert("You can edit only your message");

return;

}

let newMsg = prompt("Edit your message", chats[i].message);

if(newMsg != null && newMsg != ""){

chats[i].message = newMsg;

localStorage.setItem("chats", JSON.stringify(chats));

loadMessages();

}

}

}

}
function logout(){

for(let i=0; i<users.length; i++){

if(users[i].username == currentUser){

users[i].status = "Offline";
users[i].lastSeen = new Date().toLocaleString();

}

}

localStorage.setItem("users", JSON.stringify(users));

// Reply reset
replyMessageId = null;
selectedFriend = "";

document.getElementById("replyBox").style.display = "none";
document.getElementById("replyText").innerHTML = "";
document.getElementById("message").value = "";

document.getElementById("friendProfile").innerHTML = "";
document.getElementById("messages").innerHTML = "";
document.getElementById("friendList").innerHTML = "";
document.getElementById("requestList").innerHTML = "";
document.getElementById("profile").src =
"https://via.placeholder.com/80";
document.getElementById("userName").innerHTML = "";
document.getElementById("chatBox").style.display = "none";
document.getElementById("loginBox").style.display = "block";
localStorage.removeItem("currentUser");
currentUser = "";

localStorage.removeItem("currentUser");

document.getElementById("status").innerHTML = "";

}
function clearData(){

if(confirm("Delete all users and chats?")){

localStorage.clear();

alert("All data cleared");

location.reload();

}

}
async function sendFriendRequest(){
    let friend = document.getElementById("friendUsername").value.trim();

    if(friend == ""){
        alert("Enter friend username");
        return;
    }

    if(friend == currentUser){
        alert("You cannot add yourself");
        return;
    }

    try{
        let response = await fetch("/api/friend-request", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: currentUser,
                friend_username: friend
            })
        });

        let data = await response.json();

        if(data.success){
            alert("Friend request sent");
            document.getElementById("friendUsername").value = "";
        }else{
            alert(data.message || "Failed to send request");
        }

    }catch(error){
        console.error(error);
        alert("Server connection failed");
    }
}
async function loadRequests(){
console.log("🔥 LOAD REQUESTS RUNNING:", currentUser);
    const list = document.getElementById("requestList");

    if(!list || !currentUser) return;

    try{
        const response = await fetch(
            "/api/friend-requests/" +
            encodeURIComponent(currentUser) +
            "?t=" + Date.now()
        );

        const data = await response.json();

        if(!data.success){
            list.innerHTML = "<p>Could not load requests.</p>";
            return;
        }

        list.innerHTML = "";

        if(data.requests.length === 0){
            list.innerHTML = "<p>No friend requests.</p>";
            return;
        }

        data.requests.forEach(function(request){

            const p = document.createElement("p");

            p.innerHTML =
                escapeHTML(request.username) +
                " sent you a request ";

            const button = document.createElement("button");

            button.innerText = "Accept";

            button.onclick = function(){
                acceptRequest(request.id);
            };

            p.appendChild(button);
            list.appendChild(p);
        });

    }catch(error){
        console.error("Request loading error:", error);
        list.innerHTML =
            "<p>Server connection failed.</p>";
    }
}


async function acceptRequest(requestId){

    try{

        const response = await fetch(
            "/api/friend-requests/" +
            requestId +
            "/accept",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        if(data.success){

            alert("Friend request accepted");

            await loadRequests();
            await loadFriends();

        }else{

            alert(
                data.message ||
                "Failed to accept request"
            );
        }

    }catch(error){

        console.error("Accept request error:", error);

        alert("Server connection failed");
    }
}

function getProfileName(username){	
for(let i=0; i<users.length; i++){

if(users[i].username == username){

if(users[i].profileName){

return users[i].profileName;

}

}

}

return username;

}
function escapeHTML(text){

return text
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");

}
function changeName(){

let newName = prompt("Enter new name");

if(newName == null || newName == ""){
return;
}

for(let i=0; i<users.length; i++){

if(users[i].username == currentUser){

users[i].profileName = newName;

break;

}

}

localStorage.setItem(
"users",
JSON.stringify(users)
);


document.getElementById("userName").innerHTML =
"User: " + newName;


alert("Name Updated");

loadFriends();

}
function openProfileSettings(){

document.getElementById("profileSettings").style.display="block";


for(let i=0;i<users.length;i++){

if(users[i].username==currentUser){

document.getElementById("newProfileName").value =
users[i].profileName;

}

}

}



function closeProfileSettings(){

document.getElementById("profileSettings").style.display="none";

}



function saveProfile(){

let name =
document.getElementById("newProfileName").value;


let file =
document.getElementById("newPhoto").files[0];


for(let i=0;i<users.length;i++){

if(users[i].username==currentUser){


if(name!=""){

users[i].profileName=name;

}


if(file){

let reader=new FileReader();

reader.onload=function(){

users[i].photo=reader.result;

localStorage.setItem(
"users",
JSON.stringify(users)
);


document.getElementById("profile").src=
reader.result;


loadFriends();

alert("Profile Updated");

}


reader.readAsDataURL(file);

return;

}


}

}


localStorage.setItem(
"users",
JSON.stringify(users)
);


document.getElementById("userName").innerHTML=
"User: "+name;


loadFriends();


alert("Profile Updated");

closeProfileSettings();

}
function closeFriendProfile(){

document.getElementById("friendProfile").innerHTML="";

}
function showActions(id){

let box = document.getElementById("actions_"+id);

if(!box){
return;
}

if(box.style.display == "block"){

box.style.display = "none";

}
else{

box.style.display = "block";

}

}
function searchMessages(){

let search =
document.getElementById("searchMessage").value.toLowerCase();

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

let box =
document.getElementById("messages");

box.innerHTML = "";

for(let i=0; i<chats.length; i++){

if(
(chats[i].from == currentUser &&
 chats[i].to == selectedFriend) ||

(chats[i].from == selectedFriend &&
 chats[i].to == currentUser)
){

if(
search == "" ||
chats[i].message.toLowerCase().includes(search)
){

let className =
chats[i].from == currentUser
? "myMessage"
: "otherMessage";

box.innerHTML +=
"<p class='"+className+"'>"+
getProfileName(chats[i].from)+": "+
escapeHTML(chats[i].message)+
"<br>"+
chats[i].time+
"</p>";

}

}

}

box.scrollTop = box.scrollHeight;

}
function copyMessage(id){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

let text = chats[i].message;

// Modern clipboard try गर्ने
if(navigator.clipboard){

navigator.clipboard.writeText(text)
.then(function(){

alert("Message Copied 📋");

})
.catch(function(){

fallbackCopy(text);

});

}
else{

fallbackCopy(text);

}

break;

}

}

}

function fallbackCopy(text){

let textarea = document.createElement("textarea");

textarea.value = text;

textarea.style.position = "fixed";
textarea.style.left = "-9999px";

document.body.appendChild(textarea);

textarea.focus();
textarea.select();

try{

document.execCommand("copy");

alert("Message Copied 📋");

}
catch(error){

alert("Copy failed");

}

document.body.removeChild(textarea);

}
function forwardMessage(id){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

let selectedChat = null;

for(let i = 0; i < chats.length; i++){

if(chats[i].id == id){

selectedChat = chats[i];
break;

}

}

if(!selectedChat){
return;
}

let friendList = [];

for(let i = 0; i < users.length; i++){

if(users[i].username == currentUser){

if(users[i].friends){
friendList = users[i].friends;
}

break;

}

}

if(friendList.length == 0){

alert("You have no friends");
return;

}

let choice = prompt(
"Forward to which friend?\n\n" +
friendList.join("\n")
);

if(choice == null || choice == ""){
return;
}

if(!friendList.includes(choice)){

alert("Friend not found");
return;

}

let newChats =
JSON.parse(localStorage.getItem("chats")) || [];

newChats.push({

id: Date.now(),

from: currentUser,

to: choice,

message: selectedChat.message || "",

photo: selectedChat.photo || "",

time: new Date().toLocaleString(),

seen: false,

replyTo: null,

reaction: "",

pinned: false,

starred: false

});

localStorage.setItem(
"chats",
JSON.stringify(newChats)
);

alert("Message Forwarded ➡️");

}
function reactToMessage(id){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

let reactionBox =
document.createElement("div");

reactionBox.style.position = "fixed";
reactionBox.style.left = "50%";
reactionBox.style.top = "50%";
reactionBox.style.transform = "translate(-50%, -50%)";
reactionBox.style.background = "white";
reactionBox.style.padding = "15px";
reactionBox.style.borderRadius = "15px";
reactionBox.style.boxShadow = "0 0 10px gray";
reactionBox.style.zIndex = "9999";

reactionBox.innerHTML =
"<b>Choose Reaction</b><br><br>"+

"<button onclick=\"setReaction("+id+",'❤️')\">❤️</button>"+

"<button onclick=\"setReaction("+id+",'👍')\">👍</button>"+

"<button onclick=\"setReaction("+id+",'😂')\">😂</button>"+

"<button onclick=\"setReaction("+id+",'😮')\">😮</button>"+

"<button onclick=\"setReaction("+id+",'😢')\">😢</button>"+

"<br><br>"+

"<button onclick=\"this.parentElement.remove()\">Cancel</button>";

document.body.appendChild(reactionBox);

}
function setReaction(id, reaction){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

chats[i].reaction = reaction;

break;

}

}

localStorage.setItem(
"chats",
JSON.stringify(chats)
);

let boxes =
document.querySelectorAll("body > div");

boxes.forEach(function(box){

if(box.innerText &&
box.innerText.includes("Choose Reaction")){

box.remove();

}

});

loadMessages();

}
function formatMessageTime(time){

let date = new Date(time);

if(isNaN(date.getTime())){
return time;
}

let today = new Date();

let yesterday = new Date();
yesterday.setDate(today.getDate() - 1);

let dateText = "";

if(date.toDateString() == today.toDateString()){

dateText = "Today";

}
else if(date.toDateString() == yesterday.toDateString()){

dateText = "Yesterday";

}
else{

dateText =
date.toLocaleDateString();

}

return dateText + " " +
date.toLocaleTimeString([], {
hour:"2-digit",
minute:"2-digit"
});

}
function pinMessage(id){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

chats[i].pinned = !chats[i].pinned;

break;

}

}

localStorage.setItem(
"chats",
JSON.stringify(chats)
);

loadMessages();

}
function starMessage(id){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

for(let i=0; i<chats.length; i++){

if(chats[i].id == id){

chats[i].starred = !chats[i].starred;

break;

}

}

localStorage.setItem(
"chats",
JSON.stringify(chats)
);

loadMessages();

}
function showStarredMessages(){

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

let box =
document.getElementById("starredMessages");

if(box.style.display == "block"){

box.style.display = "none";
return;

}

box.style.display = "block";

box.innerHTML = "<h3>⭐ Starred Messages</h3>";

let found = false;

for(let i=0; i<chats.length; i++){

if(
chats[i].starred &&
(
(chats[i].from == currentUser &&
 chats[i].to == selectedFriend) ||

(chats[i].from == selectedFriend &&
 chats[i].to == currentUser)
)
){

found = true;

box.innerHTML +=
"<div style='background:#f5f5f5; padding:8px; margin:5px; border-radius:8px;'>"+
"<b>"+getProfileName(chats[i].from)+"</b><br>"+
escapeHTML(chats[i].message)+
"<br><small>"+chats[i].time+"</small>"+
"</div>";

}

}

if(!found){

box.innerHTML +=
"<p>No starred messages ⭐</p>";

}

}
function sendPhotoMessage(){

let files = document.getElementById("photoMessage").files;

if(files.length == 0){
    return;
}

if(selectedFriend == ""){
    alert("Please select a friend");
    document.getElementById("photoMessage").value = "";
    return;
}

let chats =
JSON.parse(localStorage.getItem("chats")) || [];

let processed = 0;

for(let i = 0; i < files.length; i++){

let file = files[i];

let reader = new FileReader();

reader.onload = function(event){

let img = new Image();

img.onload = function(){

let canvas = document.createElement("canvas");

let maxWidth = 800;
let maxHeight = 800;

let width = img.width;
let height = img.height;

if(width > maxWidth){

height = height * maxWidth / width;
width = maxWidth;

}

if(height > maxHeight){

width = width * maxHeight / height;
height = maxHeight;

}

canvas.width = width;
canvas.height = height;

let ctx = canvas.getContext("2d");

ctx.drawImage(
img,
0,
0,
width,
height
);

let compressedPhoto =
canvas.toDataURL("image/jpeg",0.7);

chats.push({

id: Date.now() + processed,

from: currentUser,

to: selectedFriend,

message: "",

photo: compressedPhoto,

time: new Date().toLocaleString(),

seen: false,

replyTo: null,

reaction: "",

pinned: false,

starred: false

});

processed++;

if(processed == files.length){

localStorage.setItem(
"chats",
JSON.stringify(chats)
);

document.getElementById("photoMessage").value = "";

loadMessages();

}

};

img.src = event.target.result;

};

reader.readAsDataURL(file);

}

}
function sendVideoMessage(){

let file =
document.getElementById("videoMessage").files[0];

if(!file){
    return;
}

if(selectedFriend == ""){

    alert("Please select a friend");

    document.getElementById("videoMessage").value = "";

    return;
}

if(!videoDB){

    alert("Video database is not ready. Please try again.");

    return;
}

let videoId =
currentUser + "_" +
selectedFriend + "_" +
Date.now();

let transaction =
videoDB.transaction(["videos"], "readwrite");

let store =
transaction.objectStore("videos");

store.put({

    id: videoId,

    from: currentUser,

    to: selectedFriend,

    file: file,

    time: new Date().toLocaleString()

});

transaction.oncomplete = function(){

    let chats =
    JSON.parse(localStorage.getItem("chats")) || [];

    chats.push({

        id: Date.now(),

        from: currentUser,

        to: selectedFriend,

        message: "",

        photo: "",

        video: videoId,

        time: new Date().toLocaleString(),

        seen: false,

        replyTo: null,

        reaction: "",

        pinned: false,

        starred: false

    });

    localStorage.setItem(
        "chats",
        JSON.stringify(chats)
    );

    document.getElementById("videoMessage").value = "";

    loadMessages();

};

transaction.onerror = function(){

    alert("Video save failed");

};

}


function loadChatVideos(){

    if(!videoDB){
        return;
    }

    let videos =
    document.querySelectorAll("video[data-video-id]");

    videos.forEach(function(video){

        let videoId =
        video.getAttribute("data-video-id");

        let transaction =
        videoDB.transaction(["videos"], "readonly");

        let store =
        transaction.objectStore("videos");

        let request =
        store.get(videoId);

        request.onsuccess = function(event){

            let data = event.target.result;

            if(data && data.file){

                let videoURL =
                URL.createObjectURL(data.file);

                video.src = videoURL;

            }

        };

        request.onerror = function(){

            console.log("Video load failed");

        };

    });

}
/* 🔔 Automatic New Message Detection */

let lastKnownMessageId = 0;

function startMessageNotification(){

    setInterval(function(){

        if(currentUser == ""){
            return;
        }

        let chats =
        JSON.parse(localStorage.getItem("chats")) || [];

        if(chats.length == 0){
            return;
        }

        let latestMessage =
        chats[chats.length - 1];

        if(!latestMessage){
            return;
        }

        if(latestMessage.id <= lastKnownMessageId){
            return;
        }

        lastKnownMessageId =
        latestMessage.id;

        /* आफ्नै message भए notification नदेखाउने */

        if(latestMessage.from == currentUser){
            return;
        }

        /* आफूलाई आएको message मात्र */

        if(latestMessage.to != currentUser){
            return;
        }

        /* अहिले त्यही friend को chat खोलिएको छ भने popup नदेखाउने */

        if(selectedFriend == latestMessage.from){
            return;
        }

        showMessageNotification(
            latestMessage.from,
            latestMessage.message
        );

    },2000);

}


/* Notification system start */

startMessageNotification();
function testNotification(){

    if(currentUser == ""){
        alert("Please login first");
        return;
    }

    showMessageNotification(
        currentUser,
        "This is a test notification 🔔"
    );

}
function requestNotificationPermission(){

    if(!("Notification" in window)){

        alert("❌ This browser does not support notifications.");
        return;
    }

    if(!window.isSecureContext){

        alert(
            "⚠️ Notification चलाउन Rky Chat लाई HTTPS वा localhost बाट खोल्नुपर्छ.\n\n" +
            "अहिले यो local/content page बाट खुलेको छ."
        );

        return;
    }

    Notification.requestPermission().then(function(permission){

        if(permission === "granted"){

            alert("🔔 Notifications Enabled");

            new Notification("Rky Chat", {
                body: "Notifications are now enabled 🔔"
            });

        }
        else{

            alert("❌ Notification Permission Denied");
        }

    });

}
// 🔄 Auto refresh friend status
setInterval(function(){

    if(currentUser == ""){
        return;
    }

    loadFriends();

}, 5000);
// 🔐 Login required every time app is opened
window.addEventListener("load", function(){

    // पुरानो currentUser हटाउने
    currentUser = "";
    selectedFriend = "";
    replyMessageId = null;

    localStorage.removeItem("currentUser");

    // Login देखाउने
    document.getElementById("loginBox").style.display = "block";

    // Chat लुकाउने
    document.getElementById("chatBox").style.display = "none";

    // पुरानो data UI बाट हटाउने
    document.getElementById("messages").innerHTML = "";
    document.getElementById("friendList").innerHTML = "";
    document.getElementById("requestList").innerHTML = "";
    document.getElementById("friendProfile").innerHTML = "";
    document.getElementById("userName").innerHTML = "";
    document.getElementById("status").innerHTML = "";

});
function sendMediaNotification(receiver, messageText){

    for(let i = 0; i < users.length; i++){

        if(users[i].username == receiver){

            if(!users[i].notifications){
                users[i].notifications = {};
            }

            if(!users[i].notifications[currentUser]){
                users[i].notifications[currentUser] = 0;
            }

            users[i].notifications[currentUser]++;

            break;
        }
    }

    localStorage.setItem(
        "users",
        JSON.stringify(users)
    );
}
