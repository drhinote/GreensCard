var Client = require('bitcoin-core');
var express = require('express');
var bodyParser = require('body-parser');

var client = new Client({
    port: 420,
    username: 'drh',
    password: '5thx34r13h818eyq8e811ge17'
});
var app = express();
var port = process.env.PORT || 80;

app.use(bodyParser.json({ strict: false }));

app.route('/tx').post(async (req, res) => {
    try {
        console.log(new Date().toLocaleTimeString() + " Broadcasting tx");
        var txid = await client.sendRawTransaction(req.body.tx);
        res.status(200).send(JSON.stringify({ success: 1, txid: txid }));
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.route('/unspent').get(async (req, res) => {
    try {
        console.log(new Date().toLocaleTimeString() + " sending unspent");
        res.status(200).send(await client.listUnspent(0));
    } catch (e) {
        res.sendStatus(500);
    }
});

app.listen(port);

console.log(new Date().toLocaleTimeString() + ' Server started on: ' + port);
