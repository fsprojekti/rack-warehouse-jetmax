export default {
    "slotsPositions": [
        //Special slot LOAD
        [-75, -75, 60],
        //Special slot UNLOAD
        [150, -75, 60],
        //Storage slots
        [-75, -150, 60],
        [0, -150, 60],
        [75, -150, 60],
        [150, -150, 60],
        [-75, -150, 70],
        [0, -150, 70],
        [75, -150, 70],
        [150, -150, 70],
        [-75, -150, 80],
        [0, -150, 80],
        [75, -150, 80],
        [150, -150, 80],
        [-75, -150, 90],
        [0, -150, 90],
        [75, -150, 90],
        [150, -150, 90]
    ],
    "slotsInit": [
        true, true, false, false,
        false, false, false, false,
        false, false, false, false,
        false, false, false, true
    ],
    "JetMax": {
        "url": "192.168.220.96:9090"
    },
    "modbus": {
        "ip": "0.0.0.0",
        "port":8502
    }
}