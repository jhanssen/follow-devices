/*global require,process*/

const mqtt = require("mqtt");
const path = require("path");
const fs = require("fs");
const mdns = require("mdns");
const appPath = require("app-root-path");
const argv = require("minimist")(process.argv.slice(2));
const options = require("@jhanssen/options")("devices", argv);

const devices = {};

function loadDevices() {
    return new Promise((resolve, reject) => {
        const file = path.join(appPath.toString(), "device-list.json");
        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function sendDevices(client) {
    loadDevices().then(devices => {
        if (typeof devices === "object") {
            if (devices instanceof Array) {
                for (let i = 0; i < devices.length; ++i) {
                    console.log("publishing device", devices[i]);
                    client.publish("follow/devices", JSON.stringify(devices[i]));
                }
            } else {
                console.log("publishing device", JSON.stringify(devices));
                client.publish("follow/devices", devices);
            }
        } else {
            console.error("invalid device data", typeof devices);
        }
    }).catch(err => {
        console.error("error loading devices", err.message);
    });
}

(function() {
    if ("list" in argv || "devices" in argv) {
        const browser = mdns.createBrowser(mdns.tcp("googlecast"));
        browser.on("serviceUp", service => {
            //console.log(service);
            console.log(`Cast device ${service.name} at ${service.addresses[0]}:${service.port}`);
        });
        browser.start();
        return;
    }

    const url = options("url");
    const opts = options.json("options", {});
    const addOption = name => {
        const v = options(name);
        if (v)
            opts[name] = v;
    };
    addOption("username");
    addOption("password");

    const client = mqtt.connect(url, opts);

    client.once("connect", function () {
        console.log("mqtt connected");
        client.subscribe("follow/devices/command");
        sendDevices(client);
    });
    client.once("close", () => {
        console.log("mqtt closed");
        client.end();
    });
    client.on("error", err => {
        console.log("mqtt error", err.message);
        client.end();
    });

    client.on("message", (topic, message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }
        switch (topic) {
        case "follow/devices/command":
            switch (data.command) {
            case "request":
                sendDevices(client);
                break;
            }
            break;
        }
    });
})();
