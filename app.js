import config from './config.js';
import {createRequire} from "module";
import WebSocket from 'ws';

const require = createRequire(import.meta.url);

const ModbusRTU = require("modbus-serial");

const slots = config.slotsInit;
//State 0-idle, 1-moving, 2-error-modbus,3 error-jetmax
let warehouseState = 0;
let suckerState = false;
let slotSource = 0;
let slotTarget = 3;
let move = false;
let currentPosition = [];

//Socket connection
let ws = new WebSocket('ws:' + config.JetMax.url);

//On successful connection
ws.on('open', function open() {
    console.log("Connection to server successful.");

    // SUBSCRIBE TO ALL RELEVANT TOPICS:
    //  /jetmax/status/
    let subData = subscribeData("id1", "/jetmax/status", "jetmax_control/JetMax", "none", 0, 0);
    console.log("subscribe data sent: " + JSON.stringify(subData));
    ws.send(JSON.stringify(subData));

    // ADVERTISE ALL RELEVANT TOPICS
    // advertise the /jetmax/speed_command
    let advData = advertiseData("advertise:/moveTo", "/jetmax/speed_command", "jetmax/SetJetMax", false, 100);
    console.log("advertise data sent: " + JSON.stringify(advData));
    ws.send(JSON.stringify(advData));

    // advertise the /jetmax/end_effector/sucker/command
    advData = advertiseData("advertise:/suction", "/jetmax/end_effector/sucker/command", "std_msgs/Bool", false, 100);
    console.log("advertise data sent: " + JSON.stringify(advData));
    ws.send(JSON.stringify(advData));
})

ws.on('error', function error(error) {
    console.log("Error communication with the websocket server, reason: " + error);
    warehouseState = 3;
})

ws.on('message', function message(data) {

    let dataJson = JSON.parse(data);
    //console.log(dataJson);

    // for now only the /jetmax/status message is expected to arrive
    if (dataJson.topic === '/jetmax/status') {
        // update local variable for jetmax robot arm state - used by the /basic/state endpoint
        currentPosition[0] = dataJson.msg.x;
        currentPosition[1] = dataJson.msg.y;
        currentPosition[2] = dataJson.msg.z;
    }
})

//Modbus server
let serverTCP = new ModbusRTU.ServerTCP(
    {
        getInputRegister: function (addr, unitID) {
            // Synchronous handling
            return addr;
        },
        getHoldingRegister: function (addr, unitID) {
            return new Promise((resolve, reject) => {
                switch (addr) {
                    //Return slots current occupation state
                    case 100: {
                        resolve(codeSlotsState());
                    }
                        break;
                    case 101: {
                        resolve(warehouseState);
                    }
                        break;
                    default:
                        resolve(0);
                }
            })
        },
        getCoil: function (addr, unitID) {
            // Asynchronous handling (with Promises, async/await supported)
            return new Promise((resolve, reject) => {
                switch (addr) {
                    //Sucker state
                    case 201: {
                        resolve(suckerState);
                    }
                        break
                    default:
                        resolve(false);
                }
            });
        },
        setRegister: function (addr, value, unitID) {
            console.log("Register: address " + addr + " value: " + value);
            switch (addr) {
                //Set slot source
                case 102: {
                    slotSource = value;
                }
                    break;
                //Set slot target
                case 103: {
                    slotTarget = value;
                }
                    break
            }
        },
        setCoil: function (addr, value, unitID) {
            // Asynchronous handling supported also here
            console.log("Coil: address ", addr, " ", value);
            switch (addr) {
                case 200: {
                    if (value) {
                        executeMove().then(out => {
                            console.log("Move executed successfully");
                        });
                    }
                }
                    break;
            }

        },
        readDeviceIdentification: function (addr) {
            return {
                0x00: "MyVendorName",
                0x01: "MyProductCode",
                0x02: "MyMajorMinorRevision",
                0x05: "MyModelName",
                0x97: "MyExtendedObject1",
                0xAB: "MyExtendedObject2"
            };
        }
    },
    {host: "0.0.0.0", port: 8502, debug: true, unitID: 1});

serverTCP.on("socketError", function (err) {
    // Handle socket error if needed, can be ignored
    console.error(err);
});

serverTCP.on("initialized", function () {
    console.log("initialized");
});

let codeSlotsState = () => {
    return parseInt(slots.map(slot => slot ? 1 : 0).reverse().join(''), 2);
}

let executeMove = () => {
    return new Promise(async (resolve, reject) => {
        //Set state to busy
        warehouseState = 1;
        //Move robot to upper position
        await moveRobotUp(150)

        //Move robot to upper source position
        await moveRobot([
            config.slotsPositions[slotSource][0],
            config.slotsPositions[slotSource][1],
            150
        ]);

        //Move robot to exact source position
        await moveRobot(config.slotsPositions[slotSource]);

        //Enable sucking
        await suctionON();

        //Move robot to upper source position
        await moveRobot([
            config.slotsPositions[slotSource][0],
            config.slotsPositions[slotSource][1],
            150
        ]);

        //Move roboto to upper target position
        await moveRobot([
            config.slotsPositions[slotTarget][0],
            config.slotsPositions[slotTarget][1],
            150
        ]);

        //Move robot to exact target position
        await moveRobot(config.slotsPositions[slotTarget]);

        //Disable sucking
        await suctionOFF()

        //Move robot to upper target position
        await moveRobot([
            config.slotsPositions[slotTarget][0],
            config.slotsPositions[slotTarget][1],
            150
        ]);

        //Set state
        warehouseState = 0;
    })
}

function subscribeData(id, topic, type, compression, throttle_rate, queue_length) {

    let data = {};
    data.op = "subscribe";
    data.id = id;
    data.topic = topic;
    data.type = type;
    data.compression = compression;
    data.throttle_rate = throttle_rate;
    data.queue_length = queue_length;

    //console.log(data);
    return data;

}

/* BUILD ADVERTISE MESSAGE DATA
op: name of the operation = advertise
id: id of the message
topic: topic that it is advertising
type: type of the topic that it is advertising
latch: optional, default: false
queue_size: optional, default: 100
 */
function advertiseData(id, topic, type, latch, queue_size) {

    let data = {};
    data.op = "advertise";
    data.id = id;
    data.topic = topic;
    data.type = type;
    data.latch = latch;
    data.queue_size = queue_size;

    //console.log(data);
    return data;

}

/* BUILD PUBLISH MESSAGE DATA
op: name of the operation = publish
id: id of the message
topic: topic to which it is publishing
msg: data in JSON format, dependent on the topic
latch: optional, default: false
 */
function publishData(id, topic, msg, latch) {

    let data = {};
    data.op = "publish";
    data.id = id;
    data.topic = topic;
    data.msg = msg;
    data.latch = latch;

    // console.log(data);
    return data;

}

/* BUILD CALL SERVICE MESSAGE DATA
op: name of the operation = call_service
id: id of the message
service: name of the service that is called
args: optional, default: {}
 */
function callServiceData(id, service, type, args) {

    let data = {};
    data.op = "call_service";
    data.id = id;
    data.service = service;
    data.type = type;
    data.args = args;

    //console.log(data);
    return data;

}

function moveRobot(position) {
    return new Promise(async resolve => {
        let msg = {};
        msg.x = position[0];
        msg.y = position[1];
        msg.z = position[2];
        msg.duration = 100;
        let pubData = publishData("publish:/moveTo", "/jetmax/speed_command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData));
        await new Promise(resolve1 => setTimeout(resolve1, 2000));
        resolve();
    })
}

function moveRobotUp(z) {
    return new Promise(async resolve => {
        //Get current position robot
        let msg = {};
        msg.x=currentPosition[0];
        msg.y=currentPosition[1]
        msg.z = z;
        msg.duration = 100;
        let pubData = publishData("publish:/moveTo", "/jetmax/speed_command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData));
        await new Promise(resolve1 => setTimeout(resolve1, 2000));
        resolve();
    })
}

function suctionON(){
    return new Promise(async resolve => {
        let msg={};
        msg.data=true;
        let pubData = publishData("publish:/suction", "/jetmax/end_effector/sucker/command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData));
        await new Promise(resolve1 => setTimeout(resolve1, 1000));
        resolve()
    })
}

function suctionOFF(){
    return new Promise(async resolve => {
        let msg={};
        msg.data=false;
        let pubData = publishData("publish:/suction", "/jetmax/end_effector/sucker/command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData));
        await new Promise(resolve1 => setTimeout(resolve1, 5000));
        resolve()
    })
}