var Client = require('bitcoin-core');
var express = require('express');
var bodyParser = require('body-parser');
var BigInteger = require('bigi');
var bitcoin = require('bitcoinjs-lib');
var fs = require('fs');
var https = require('https');

var client = new Client({
    port: 420,
    username: 'drh',
    password: '5thx34r13h818eyq8e811ge17'
});
var app = express();
var port = process.env.PORT || 80;

app.use(bodyParser.json({ strict: false }));

var bongger = {
    messagePrefix: '\x19Bongger Signed Message:\n',
    bip32: {
            public: 0x019da462,
            private: 0x019d9cfe
    },
    pubKeyHash: 24,
    scriptHash: 22,
    wif: 152
};

/*
addmultisigaddress < nrequired > <'["key","key"]' > [account]
addnode < node > <add|remove | onetry >
    backupwallet < destination >
    createmultisig < nrequired > <'["key","key"]' >
    createrawtransaction[{ "txid": txid, "vout": n },...] { address: amount,...}
decoderawtransaction < hex string>
    dumpprivkey < bonggeraddress >
    encryptwallet < passphrase >
    getaccount < bonggeraddress >
    getaccountaddress < account >
    getaddednodeinfo < dns > [node]
getaddressesbyaccount < account >
    getbalance[account][minconf = 1]
getbestblockhash
getblock < hash > [verbose = true]
getblockcount
getblockhash < index >
    getblocktemplate[params]
getconnectioncount
getdifficulty
getgenerate
gethashespersec
getinfo
getmininginfo
getnetworkhashps[blocks][height]
getnewaddress[account]
getpeerinfo
getrawmempool
getrawtransaction < txid > [verbose = 0]
getreceivedbyaccount < account > [minconf = 1]
getreceivedbyaddress < bonggeraddress > [minconf = 1]
gettransaction < txid >
    gettxout < txid > <n> [includemempool=true]
gettxoutsetinfo
getwork [data]
getworkex [data, coinbase]
help [command]
importprivkey <bonggerprivkey> [label] [rescan=true]
keypoolrefill
listaccounts [minconf=1]
listaddressgroupings
listlockunspent
listreceivedbyaccount [minconf=1] [includeempty=false]
listreceivedbyaddress [minconf=1] [includeempty=false]
listsinceblock [blockhash] [target-confirmations]
listtransactions [account] [count=10] [from=0]
listunspent [minconf=1] [maxconf=9999999] ["address",...]
lockunspent unlock? [array-of-Objects]
move <fromaccount> <toaccount> <amount> [minconf=1] [comment]
sendfrom <fromaccount> <tobonggeraddress> <amount> [minconf=1] [comment] [comment-to]
sendmany <fromaccount> {address:amount,...} [minconf=1] [comment]
sendrawtransaction <hex string>
                            sendtoaddress <bonggeraddress> <amount> [comment] [comment-to]
setaccount <bonggeraddress> <account>
                                    setgenerate <generate> [genproclimit]
settxfee <amount>
                                            signmessage <bonggeraddress> <message>
                                                signrawtransaction <hex string> [{"txid":txid,"vout":n,"scriptPubKey":hex,"redeemScript":hex},...] [<privatekey1>,...] [sighashtype="ALL"]
stop
submitblock <hex data> [optional-params-obj]
validateaddress <bonggeraddress>
                                                            verifychain [check level] [num blocks]
verifymessage <bonggeraddress> <signature> <message>
*/



var newAddress = function (secret, salt) {
    var hash = bitcoin.crypto.sha256(new Buffer(secret + salt));
    var d = BigInteger.fromBuffer(hash);
    return new bitcoin.ECPair(d, null, { network: bongger });
};
var walletSalt = ' whiskey india november';
var tipSalt = ' to insure promptness';

app.route('/tx').post(async (req, res) => { 
    try {
        console.log("Broadcasting tx");
        res.status(200).send(JSON.stringify({ success: 1, txid: await client.sendRawTransaction(req.body.tx) }));
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.route('/balance').post(async (req, res) => {
    try {        
        var bal = await client.getBalance(req.body.address);
        console.log("Balance for " + req.body.address + ": " + bal);
        res.status(200).send(JSON.stringify({ balance: bal }));
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.route('/getAccount').post(async (req, res) => {
    try {
        var address = newAddress(req.body.email, walletSalt);
        console.log("Account: " + address.getAddress());
        res.status(200).send(JSON.stringify({ account: address.toWIF(), address: address.getAddress() }));
        var info = await client.validateAddress(address.getAddress());
        if (!info.ismine) {
            await client.importPrivKey(address.toWIF(), address.getAddress(), false);
        }
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.route('/getTipAccount').post(async (req, res) => {
    try {
        var address = newAddress(req.body.email, tipSalt);
        console.log("Tip Account: " + address.getAddress());
        res.status(200).send(JSON.stringify({ account: address.toWIF(), address: address.getAddress() }));
        var info = await client.validateAddress(address.getAddress());
        if (!info.ismine) {
            await client.importPrivKey(address.toWIF(), address.getAddress(), false);
        }
    } catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
});

app.route('/unspent').get(async (req, res) => {
    try {
        console.log("sending unspent");
        res.status(200).send(await client.listUnspent(0));
    } catch (e) {
        res.sendStatus(500);
    }
});

/*
app.route('/tasks/:taskId')
    .get(todoList.read_a_task)
    .put(todoList.update_a_task)
    .delete(todoList.delete_a_task);
};
*/
app.listen(port);

/*
var privateKey = fs.readFileSync('key.pem');
var certificate = fs.readFileSync('certificate.pem');

https.createServer({
    key: privateKey,
    cert: certificate
}, app).listen(port);
*/
console.log('Server started on: ' + port);
