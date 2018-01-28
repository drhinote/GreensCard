var PeerGroup = require('bitcoin-net').PeerGroup;
var Inventory = require('bitcoin-inventory');
var express = require('express');
var bodyParser = require('body-parser');

var app = express();
var port = process.env.PORT || 80;

app.use(bodyParser.json({ strict: false }));

var peers = new PeerGroup({
    dnsSeeds: ["dnsseed01.bongger.com", "dnsseed02.bongger.com", "dnsseed03.bongger.com", "dnsseed04.bongger.com"],
    magic: 0xc0c0c0c0,
    defaultPort: 7071,
}, {
        numPeers: 8,
        acceptIncoming: true,
        peerOpts: {
            requireBloom: true,
            userAgent: "/theGreensCard:1.0.1.0/",
            relay: false
        }
    });

peers.connect();

var inv = Inventory(peers);

function broadcast(tx) {
    inv.broadcast(tx);
}

app.route('/tx').post(async (req, res) => {
    try {
        console.log(new Date().toLocaleString() + ', Relaying tx: ' + req.body.tx);
        broadcast(bitcoin.Transaction.fromHex(req.body.tx));
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.listen(port);

console.log(new Date().toLocaleTimeString() + ' Server started on: ' + port);
