self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {

    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {
            title: "Rky Chat",
            body: event.data
                ? event.data.text()
                : "New message"
        };
    }

    event.waitUntil(
        self.registration.showNotification(
            data.title || "Rky Chat",
            {
                body: data.body || "New message 🔔",
                icon: data.icon || "/icon.png",

                data: {
                    sender: data.sender || ""
                }
            }
        )
    );
});

self.addEventListener("notificationclick", event => {

    event.notification.close();

    const sender =
        event.notification.data &&
        event.notification.data.sender
            ? event.notification.data.sender
            : "";

    event.waitUntil(

        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(clientList => {

            if(clientList.length > 0){

                const client = clientList[0];

                return client.focus().then(() => {

                    client.postMessage({
                        type: "OPEN_CHAT",
                        sender: sender
                    });

                });

            }

            return clients.openWindow("/");

        })

    );
});
