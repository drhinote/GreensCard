var functions = require('firebase-functions');
var admin = require('firebase-admin');
var firebase = admin;
var ApiContracts = require('authorizenet').APIContracts;
var ApiControllers = require('authorizenet').APIControllers;
var https = require('request');
var bitcoin = require('bitcoinjs-lib');
var BigInteger = require('bigi');
var async = require('async');
var deasync = require('deasync');
var cors = require('cors')({ origin: true });
var dwolla = require('dwolla-v2');

// ----------------------------------------------- Google
var baseUrl = 'https://us-central1-greenscard-177506.cloudfunctions.net/';

// ----------------------------------------------- BlockCypher
var metadataToken = 'e6654717321b447d96447eb50ece8341';

// ----------------------------------------------- Authorize.net
var merchantId = '6CQcB7Maqu55';
var transactionKey = '36NxM727mm7Y4RSx';
var sigKey = 'B3C150400D8498FFCB8F2386E177B5407A16D07870A6B764C1FD71911FECB23C65152A67072BED598CD040EBE9733513688F9DDCF58F7644ABA51DF01D5D0A5C';

// ----------------------------------------------- Dwolla
const appKey = 'Po6aren82nrRV51onabj4y06ZAcdhvowd15cNnbip11Zs9iGrO';
const appSecret = 'o3Nf6FVAA3hBxQrwJSs5yZf7RXYZjuWnSRbGOFfh4G2eEkR5mQ';
const client = new dwolla.Client({
    key: appKey,
    secret: appSecret,
    environment: 'sandbox' // optional - defaults to production
});
const dwollaAuthUrl = 'https://sandbox.dwolla.com/oauth/v2/token';

// -----------------------------------------------
var COIN = 100000000;
var FEE = 250000;

var master = { uid: "main", address: "AnxTztXEdWSP5Gw3Nxz95e32cdEC6ayRbq", account: "PVLwZLKh4jvAQrvnr1XZ14xm4BUxoP7myS9N2mgwVnV3HTcoTVSc", email: 'help@greens-card.com' };
var deposits = { uid: "deposits", address: "B1Su2xbsF3swwndZyjhBqEUnkdck1dddVV", account: "PZkkWNY1gLjeBeH6xVx7LbJY7ytQB3UbUxib3Ke7McLY6Ty6crTF", email: "deposits@greens-card.com" };
var profit = { uid: "profit", address: "AmPXSszXF3q1u8j19Fu1UsZ5wEGq1AZGuG", account: "PamhuA5avVrHNnWnQaaYtDo9ckfFjHveBnDmTc7UFpVTa7uDq451", email: "transactions@greens-card.com" };
var withdrawals = { uid: "withdrawals", address: "Ahb16mRs5Bm2GybaoazVFEcRVdiJeXAuxA", account: "PYCjLZ9X6ykdgeqNucQb5T7w3iZ67NRqXS2ESpikPRmdsX6rEode", email: "withdrawals@greens-card.com" };
var networkFees = { uid: "fees", address: "Afnr4HpCVTgaqox2MxmorEMAQpjG7yqVdN", account: "PVU17q6bJcSz7jsWUxsZpr1nhnnLKVwQqwds7Xqq2MJCzBynkNUH", email: "networkFees@greens-card.com" };

var walletSalt = ' whiskey india november';
var tipSalt = ' to insure promptness';

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

admin.initializeApp(functions.config().firebase);

function getTransactionDetails(transactionId, callback) {
    var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(merchantId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    var getRequest = new ApiContracts.GetTransactionDetailsRequest();
    getRequest.setMerchantAuthentication(merchantAuthenticationType);
    getRequest.setTransId(transactionId);

    var ctrl = new ApiControllers.GetTransactionDetailsController(getRequest.getJSON());

    ctrl.execute(function () {

        var apiResponse = ctrl.getResponse();
        var response = new ApiContracts.GetTransactionDetailsResponse(apiResponse);
        callback(response);
    });
}

var timeId = trans => {
    return (Number.MAX_SAFE_INTEGER - new Date(trans.date).getTime()) + trans.signature.substring(trans.signature.length - 3);
};

var createTrans = function (from, to, amount, type, details, merchant, customer) {
    return {
        signature: from.account,
        from: {
            address: bitcoin.ECPair.fromWIF(from.account, bongger).getAddress(),
            uid: from.uid,
            email: from.email
        },
        to: to,
        batched: "false",
        customer: customer,
        merchant: merchant,
        details: details,
        amount: parseFloat(amount),
        type: type,
        date: new Date().toISOString()
    }
}

var sortTransactions = trans => {
    var res = {};
    Object.keys(trans).forEach(no => {
        var from = trans[no].from.address;
        var to = trans[no].to.address;
        if (!res[from]) {
            res[from] = { owes: [], owed: 0.0, inputs: {} };
        }
        if (!res[to]) {
            res[to] = { owes: [], owed: 0.0, inputs: {} };
        }

        res[from].signature = trans[no].signature;
        res[from].owes.push(no);
        var val = parseFloat(trans[no].amount);
        res[to].owed += val;
        res[from].owed -= val;
    });
    res[networkFees.address] = { owes: [], owed: -(FEE / COIN), inputs: {}, signature: networkFees.account };
    return res;
};

var process = () => {


    admin.database().ref('transactions').orderByChild("batched").equalTo("false").once('value').then(s => {
        if (s.exists()) {

            console.log("Batch started");
            var hashes = {};
            var newOuts = {};
            var allTrans = s.val();

            var addresses = sortTransactions(allTrans);
            var keys = Object.keys(addresses);
            var sigs = [];
            var submit = () => {
                try {
                    var tx = new bitcoin.TransactionBuilder(bongger);
                    keys.forEach(address => {
                        Object.keys(addresses[address].inputs).forEach(x => {
                            var input = addresses[address].inputs[x];
                            tx.addInput(input.txid, input.vout);
                            sigs.push(addresses[address].signature);
                        });
                    });
                    var cntr = 0;
                    keys.forEach(address => {
                        if (addresses[address].owed > 0) {
                            newOuts[address] = { amount: addresses[address].owed, vout: cntr };
                            cntr++;
                            tx.addOutput(address, Math.floor(addresses[address].owed * COIN));
                        }
                    });
                    sigs.forEach((sig, i) => tx.sign(i, bitcoin.ECPair.fromWIF(sig, bongger)));

                    console.log("Broadcasting transaction");
                    var serialized = tx.build().toHex();
                    https({
                        url: 'http://greens.mine.nu/tx',
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tx: serialized })
                    }, (err, response, body) => {
                        if (response && response.statusCode === 200) {
                            var data = JSON.parse(body);
                            console.log("Transaction sent");
                            var updates = {};
                            Object.keys(allTrans).forEach(nm => {
                                updates['transactions/' + nm + '/batched'] = allTrans[nm].batched;
                            });
                            admin.database().ref().update(updates);
                            keys.forEach(address => {
                                Object.keys(addresses[address].inputs).forEach(x => {
                                    admin.database().ref("outputs/" + address + "/" + x).remove();
                                });
                                if (newOuts[address]) {
                                    newOuts[address].txid = data.txid;
                                    admin.database().ref("outputs/" + address).push(newOuts[address]);
                                }
                            });
                        } else {
                            console.log("Transmission error 1, aborting batch:  " + response.statusCode + " " + response.statusMessage + " " + JSON.stringify(response) + " " + JSON.stringify(err));
                        }
                    });
                } catch (e) {
                    console.log(e);
                }
            }
            var assemble = batchNo => {
                var address = keys[batchNo];
                var nextStep = () => {
                    addresses[address].owes.forEach(tran => {
                        if (addresses[address].owed >= 0) {
                            allTrans[tran].batched = "true";

                        } else {
                            var totalVal = parseFloat(allTrans[tran].amount);
                            addresses[allTrans[tran].to.address].owed -= totalVal;
                            addresses[address].owed += totalVal;
                            allTrans[tran].batched = "false";
                        }
                    });
                    if (keys[batchNo + 1]) {
                        assemble(batchNo + 1);
                    } else {
                        console.log("Addresses: " + JSON.stringify(addresses));
                        submit();
                    }
                };
                console.log("Loading " + address);

                var getOuts = () => {
                    admin.database().ref('outputs/' + address).once('value').then(s => {
                        if (s.exists()) {
                            s.forEach(cs => {
                                if (addresses[address].owed < 0) {
                                    var input = cs.val();
                                    addresses[address].owed += parseFloat(input.amount);
                                    addresses[address].inputs[cs.key] = input;
                                }
                            });
                        }
                        nextStep();
                    });
                };

                if (addresses[address].owed < 0) {
                    getOuts();
                } else {
                    nextStep();
                }

            }
            assemble(0);
        }
    });
}

exports.startBatch = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.status(200).send("You got it boss!");
        process();
    });
});

exports.addInputs = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var address = req.param("address", "AnxTztXEdWSP5Gw3Nxz95e32cdEC6ayRbq");
        if (address) {
            https({ url: 'http://greens.mine.nu/unspent' }, (err, response, body) => {
                if (response.statusCode === 200) {
                    var data = JSON.parse(body);
                    var newOuts = [];
                    var ref = admin.database().ref('outputs').child(address);
                    ref.remove();
                    if (data && data.length > 0) {
                        data.forEach(txout => {
                            if (txout.address == address) {
                                ref.push(txout);
                                newOuts.push(txout);
                            }
                        });
                    }
                    res.status(200).send(JSON.stringify(newOuts));

                }
            });
        }
        else {
            res.status(200).send("None");
        }
    });
});


exports.compareInputs = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        https({ url: 'http://greens.mine.nu/unspent' }, (err, response, body) => {
            if (response.statusCode === 200) {
                var data = JSON.parse(body);
                admin.database().ref('outputs').once('value').then(s => {
                    var remote = {};
                    var newRemotes = {};
                    var missingOuts = {};
                    if (data && data.length > 0) {
                        data.forEach(txout => {
                            if (!newRemotes[txout.address]) newRemotes[txout.address] = [];
                            newRemotes[txout.address].push(txout);
                            remote[txout.txid + txout.vout + txout.amount] = txout;
                        });
                    }
                    s.forEach(cs => {
                        var address = cs.key;
                        cs.forEach(csd => {
                            var input = csd.val();
                            if (!remote[input.txid + input.vout + input.amount]) {
                                if (!missingOuts[address]) {
                                    missingOuts[address] = [];
                                }
                                missingOuts[address].push(input);
                                csd.ref.remove();
                            }
                        });
                    });
                    Object.keys(missingOuts).forEach(addr => {
                        if (newRemotes[addr]) {
                            newRemotes[addr].forEach(output => {
                                admin.database().ref('outputs').child(addr).push(output);
                            });
                        }
                    });
                    res.status(200).send(JSON.stringify(missingOuts));
                });
            }
        });
    });
});

exports.copyInputs = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        https({ url: 'http://greens.mine.nu/unspent' }, (err, response, body) => {
            if (response.statusCode === 200) {
                var data = JSON.parse(body);
                admin.database().ref('outputs').remove().then(() => {
                    if (data && data.length > 0) {
                        data.forEach(txout => {
                            admin.database().ref('outputs/' + txout.address).push(txout);
                        });
                    }
                });
            }
            res.sendStatus(200);
        });
    });
});

exports.getAccount = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        try {
            https({
                url: 'http://greens.mine.nu/getAccount',
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req.body)
            }, (err, res1, body1) => {
                res.status(200).send(body1);
            });
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });
});

exports.getTipAccount = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        try {
            https({
                url: 'http://greens.mine.nu/getTipAccount',
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req.body)
            }, (err, res1, body1) => {
                res.status(200).send(body1);
            });
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });
});

exports.balance = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        try {
            https({
                url: 'http://greens.mine.nu/balance',
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req.body)
            }, (err, res1, body1) => {
                res.status(200).send(body1);
            });
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    });
});


var send = trans => {
    firebase.database().ref("transactions/" + timeId(trans)).set(trans);
};


function createProfile(transactionId, callback) {
    console.log("Creating Profile");
    var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(merchantId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    var createRequest = new ApiContracts.CreateCustomerProfileFromTransactionRequest();
    createRequest.setTransId(transactionId);
    createRequest.setMerchantAuthentication(merchantAuthenticationType);

    var ctrl = new ApiControllers.CreateCustomerProfileFromTransactionController(createRequest.getJSON());
    console.log("Sending Create Profile Request");
    ctrl.execute(function () {

        var apiResponse = ctrl.getResponse();

        var response = new ApiContracts.CreateCustomerProfileResponse(apiResponse);
       
        if (response != null) {
            if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
                console.log('Successfully created a customer payment profile with id: ' + response.getCustomerProfileId() +
                    ' from a transaction : ' + transactionId);
            }
            else {
                console.log('Error Code: ' + response.getMessages().getMessage()[0].getCode());
                console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
            }
        }
        else {
            console.log('Null response received');
        }
        callback(response);
    });
}

exports.payout = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        admin.database().ref('dwollaAuth').once('value').then(s => {
            if (s.exists()) {
                var cp = s.val();
                var accountToken = new client.Token({ access_token: cp.access_token, refresh_token: cp.refresh_token });
                accountToken
                    .post('transfers', req.body)
                    .then(res1 => res.status(200).send(res1.headers.get('location')));
            }
        });
    });
});

exports.payoutStatus = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        admin.database().ref('dwollaAuth').once('value').then(s => {
            if (s.exists()) {
                var cp = s.val();
                var accountToken = new client.Token({ access_token: cp.access_token, refresh_token: cp.refresh_token });
                accountToken
                    .get(req.body)
                    .then(res1 => res.status(200).send(res1.body.status));
            }
        });
    });
});

exports.refreshDwolla = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        admin.database().ref('dwollaAuth').once('value').then(s => {
            if (s.exists()) {
                var cp = s.val();
                https({
                    url: dwollaAuthUrl,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    formData: {
                        client_id: appKey,
                        client_secret: appSecret,
                        grant_type: 'refresh_token',
                        refresh_token: cp.refresh_token
                    }
                }, (err, response, body) => {
                    if (response.statusCode == 200) {
                        cp = JSON.parse(body);
                        var accountToken = new client.Token({ access_token: cp.access_token, refresh_token: cp.refresh_token });
                        var accountUrl = cp._links.account.href;
                        accountToken.get(`${accountUrl}/funding-sources`).then(res1 => {
                            cp.sources = res1.body._embedded['funding-sources']
                            admin.database().ref('dwollaAuth').set(cp);
                            res.status(200).send('valid');
                        });

                    }
                });
            }
        });

    });
});

exports.loginDwolla = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var redirect_uri = baseUrl + "loginDwolla";
        var auth = new client.Auth({
            redirect_uri: redirect_uri,
            scope: 'Send|Funding',
            verified_account: true,
            dwolla_landing: 'login',
        });
        if (!req.query.code) {
            res.status(200).send(auth.url);
        }
        else {
            https({
                url: dwollaAuthUrl,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                formData: {
                    client_id: appKey,
                    client_secret: appSecret,
                    grant_type: 'authorization_code',
                    code: req.query.code,
                    redirect_uri: redirect_uri
                }
            }, (err, response, body) => {
                if (response.statusCode == 200) {
                    var cp = JSON.parse(body);
                    var accountToken = new client.Token({ access_token: cp.access_token, refresh_token: cp.refresh_token });
                    var accountUrl = cp._links.account.href;
                    accountToken.get(`${accountUrl}/funding-sources`).then(res1 => {
                        cp.sources = res1.body._embedded['funding-sources']
                        admin.database().ref('dwollaAuth').set(cp);
                        res.redirect("https://greens.cards/admin.html");
                    });

                }
            });
        }

    });
});

exports.setupDwolla = functions.database.ref('merchants/{uid}/approved').onWrite(event => {


    /*
        var transferRequest = {
      _links: {
        source: {
          href: 'https://api.dwolla.com/funding-sources/5cfcdc41-10f6-4a45-b11d-7ac89893d985'
        },
        destination: {
          href: 'https://api.dwolla.com/customers/c7f300c0-f1ef-4151-9bbe-005005aa3747'
        }
      },
      amount: {
        currency: 'USD',
        value: '225.00'
      },
      metadata: {
        customerId: '8675309',
        notes: 'For work completed on Sept. 1, 2015'
      }
    };
    
    accountToken
      .post('transfers', transferRequest)
      .then(function(res) {
        res.headers.get('location'); // => 'https://api.dwolla.com/transfers/d76265cd-0951-e511-80da-0aa34a9b2388'
      });
    
        */


});

exports.continue = functions.https.onRequest((req, res) => {
    if (req.param("uid")) {
        admin.database().ref('control/' + req.param("uid") + '/continue').set(true);
        res.status(200).send("Redirecting...");
    }
});

exports.cancel = functions.https.onRequest((req, res) => {
    if (req.param("uid")) {
        admin.database().ref('control/' + req.param("uid") + '/cancel').set(true);
        res.status(200).send("Redirecting...");
    }
});


exports.withdrawalAddress = functions.https.onRequest((req, res) => {
    res.status(200).send(master.address);
});


var newAddress = function (secret, salt) {
    var hash = bitcoin.crypto.sha256(new Buffer(secret + salt));
    var d = BigInteger.fromBuffer(hash);
    return new bitcoin.ECPair(d, null, { network: bongger });
};

var getFee = (merch, amount, type, inclusive) => {
    return new Promise((o, x) => {
        admin.database().ref('merchants/' + merch).once('value').then(s => {
            var feeConfig = s.val() || {};
            var parsedAmount = parseFloat(amount);
            var flatFee = feeConfig[type + 'FlatFee'] ? parseFloat(feeConfig[type + 'FlatFee']) : 0.0;
            var fee = parseFloat((flatFee +
                (feeConfig[type + 'Percent'] ?
                    (inclusive ?
                        (parsedAmount - flatFee) - ((parsedAmount - flatFee) / ((parseFloat(feeConfig[type + 'Percent']) / 100.0) + 1)) :
                        parsedAmount * (parseFloat(feeConfig[type + 'Percent']) / 100.0)) : 0.0)).toFixed(2));
            parsedAmount = inclusive ? (parsedAmount - fee) : parsedAmount;
            var total = inclusive ? parsedAmount : (parsedAmount + fee);
            o({ amount: parsedAmount == 'NaN' ? 0.0 : parsedAmount, fee: fee == 'NaN' ? 0.0 : fee, total: total == 'NaN' ? 0.0 : total });
        }).catch(x);
    });
};

exports.payments = functions.https.onRequest((req, res) => {
    admin.database().ref('payments').push(req.body);
    res.status(200).send("ty come again");
    var txid = req.body.payload.id;
    getTransactionDetails(txid, function (detail) {
        var email = detail.transaction.customer.email;
        console.log(email + " deposit processing");
        admin.database().ref("email2uid/" + email.replace(new RegExp('@', 'g'), '-').replace(new RegExp('\\.', 'g'), '_')).once('value').then(s => {
            var ids = s.val();
            console.log("got info: " + JSON.stringify(ids));
            if (('' + detail.transaction.responseCode) == '1') {
                getFee('000default', detail.transaction.authAmount, 'deposit', true).then(total => {
                    var trans = createTrans(master, { uid: ids.uid, address: bitcoin.ECPair.fromWIF(ids.account, bongger).getAddress(), email: email }, total.amount, 'deposit', { depositFee: total.fee }, "master", ids.uid);
                    send(trans);
                    var feeTrans = createTrans(master, deposits, total.fee, 'deposit Fee', { deposit: trans }, "master", "depositFee");
                    send(feeTrans);
                });
            }
            if (ids.saveInfo == 'yes') {
                console.log("Saving profile");
                createProfile(txid, r => {
                    setTimeout(() => getCustomerProfile(email, s => {
                        console.log("Sending profile to DB");
                        if (s.profile.customerProfileId) admin.database().ref('info/' + ids.uid + '/profileSaved').set(s);
                    }), 3000);
                });
            }
        })
    });
});

exports.getToken = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var deposit = req.body;

        var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
        merchantAuthenticationType.setName(merchantId);
        merchantAuthenticationType.setTransactionKey(transactionKey);

        var customer = new ApiContracts.CustomerType();
        customer.setType(ApiContracts.CustomerTypeEnum.INDIVIDUAL);
        customer.setEmail(deposit.email);
        getFee('000default', deposit.amount, 'deposit', false).then(total => {
            var transactionRequestType = new ApiContracts.TransactionRequestType();
            transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
            transactionRequestType.setAmount(total.total.toFixed(2));
            transactionRequestType.setCustomer(customer);

            var setting1 = new ApiContracts.SettingType();
            setting1.setSettingName('hostedPaymentButtonOptions');
            setting1.setSettingValue('{\"text\": \"Pay\"}');

            var setting2 = new ApiContracts.SettingType();
            setting2.setSettingName('hostedPaymentOrderOptions');
            setting2.setSettingValue('{\"show\": false}');

            var setting3 = new ApiContracts.SettingType();
            setting3.setSettingName('hostedPaymentCustomerOptions');
            setting3.setSettingValue('{"showEmail": false, "requiredEmail": true}');

            var setting4 = new ApiContracts.SettingType();
            setting4.setSettingName('hostedPaymentBillingAddressOptions');
            setting4.setSettingValue('{"show": false, "required":false}');

            var setting5 = new ApiContracts.SettingType();
            setting5.setSettingName('hostedPaymentShippingAddressOptions');
            setting5.setSettingValue('{"show": false, "required":false}');

            var setting6 = new ApiContracts.SettingType();
            setting6.setSettingName('hostedPaymentReturnOptions');
            setting6.setSettingValue('{ "url": "' + baseUrl + 'continue?uid=' + deposit.uid + '", "urlText": "Continue", "cancelUrl": "' + baseUrl + 'cancel?uid=' + deposit.uid + '", "cancelUrlText": "Cancel" }');

            var settingList = [];
            settingList.push(setting1);
            settingList.push(setting2);
            settingList.push(setting3);
            settingList.push(setting4);
            settingList.push(setting5);
            settingList.push(setting6);

            var alist = new ApiContracts.ArrayOfSetting();
            alist.setSetting(settingList);

            var getRequest = new ApiContracts.GetHostedPaymentPageRequest();
            getRequest.setMerchantAuthentication(merchantAuthenticationType);
            getRequest.setTransactionRequest(transactionRequestType);
            getRequest.setHostedPaymentSettings(alist);

            var ctrl = new ApiControllers.GetHostedPaymentPageController(getRequest.getJSON());

            ctrl.execute(function () {

                var apiResponse = ctrl.getResponse();

                var response = new ApiContracts.GetHostedPaymentPageResponse(apiResponse);

                if (response != null) {
                    if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
                        var token = response.getToken();
                        res.status(200).send(token);
                    }
                    else {
                        console.log('Error Code: ' + response.getMessages().getMessage()[0].getCode());
                        console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
                    }
                }
                else {
                    console.log('Null response received');
                }
            });

        });
    });
})


function getCustomerProfile(customerProfileId, callback) {
    console.log("Retreiving profile");
    var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(merchantId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    var getRequest = new ApiContracts.GetCustomerProfileRequest();
    getRequest.setEmail(customerProfileId);
    getRequest.setMerchantAuthentication(merchantAuthenticationType);

    var ctrl = new ApiControllers.GetCustomerProfileController(getRequest.getJSON());

    ctrl.execute(function () {

        var apiResponse = ctrl.getResponse();

        var response = new ApiContracts.GetCustomerProfileResponse(apiResponse);

        if (response != null) {
            if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
                console.log('Profile ID: ' + response.getProfile().getCustomerProfileId() + ', Email: ' + response.getProfile().getEmail());
            }
            else {
                console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
            }
        }
        else {
            console.log('Null response received');
        }
        callback(response);
    });
}


exports.getProfile = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.sendStatus(200);
        getCustomerProfile(req.body.email, s => { if (s.profile.customerProfileId) admin.database().ref('info/' + req.body.uid + '/profileSaved').set(s); });
    });
});

function deleteCustomerProfile(customerProfileId) {

    var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(merchantId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    var deleteRequest = new ApiContracts.DeleteCustomerProfileRequest();
    deleteRequest.setMerchantAuthentication(merchantAuthenticationType);
    deleteRequest.setCustomerProfileId(customerProfileId);

    var ctrl = new ApiControllers.DeleteCustomerProfileController(deleteRequest.getJSON());

    ctrl.execute(function () {

        var apiResponse = ctrl.getResponse();
        var response = new ApiContracts.DeleteCustomerProfileResponse(apiResponse);
        
        if (response != null) {
            if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
                console.log('Successfully deleted a customer profile with id: ' + customerProfileId);
            }
            else {
                console.log('Error Code: ' + response.getMessages().getMessage()[0].getCode());
                console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
            }
        }
        else {
            console.log('Null response received');
        }
    });
}

exports.deleteProfile = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.sendStatus(200);
        deleteCustomerProfile(req.body.profileId);
    });
});


exports.profilePayment = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
        merchantAuthenticationType.setName(merchantId);
        merchantAuthenticationType.setTransactionKey(transactionKey);

        var profileToCharge = new ApiContracts.CustomerProfilePaymentType();
        profileToCharge.setCustomerProfileId(req.body.profile.profile.customerProfileId);

        var paymentProfile = new ApiContracts.PaymentProfile();
        paymentProfile.setPaymentProfileId(req.body.profile.profile.paymentProfiles[0].customerPaymentProfileId);
        profileToCharge.setPaymentProfile(paymentProfile);
        getFee('000default', req.body.amount, 'deposit', false).then(total => {
            var transactionRequestType = new ApiContracts.TransactionRequestType();
            transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
            transactionRequestType.setProfile(profileToCharge);
            transactionRequestType.setAmount(total.total.toFixed(2));

            var createRequest = new ApiContracts.CreateTransactionRequest();
            createRequest.setMerchantAuthentication(merchantAuthenticationType);
            createRequest.setTransactionRequest(transactionRequestType);

            var ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());

            ctrl.execute(function () {

                var apiResponse = ctrl.getResponse();

                var response = new ApiContracts.CreateTransactionResponse(apiResponse);

                if (response != null) {
                    if (response.getMessages().getResultCode() == ApiContracts.MessageTypeEnum.OK) {
                        if (response.getTransactionResponse().getMessages() != null) {
                            if (('' + response.getTransactionResponse().getResponseCode()) == '1') {
                                res.status(200).send('approved');
                            } else {
                                res.status(200).send('declined');
                            }
                        }
                        else {
                            console.log('Failed Transaction.');
                            if (response.getTransactionResponse().getErrors() != null) {
                                console.log('Error Code: ' + response.getTransactionResponse().getErrors().getError()[0].getErrorCode());
                                console.log('Error message: ' + response.getTransactionResponse().getErrors().getError()[0].getErrorText());

                            }
                            res.status(200).send('declined');

                        }
                    }
                    else {
                        console.log('Failed Transaction. ');
                        if (response.getTransactionResponse() != null && response.getTransactionResponse().getErrors() != null) {

                            console.log('Error Code: ' + response.getTransactionResponse().getErrors().getError()[0].getErrorCode());
                            console.log('Error message: ' + response.getTransactionResponse().getErrors().getError()[0].getErrorText());
                            res.status(200).send('declined');

                        }
                        else {
                            console.log('Error Code: ' + response.getMessages().getMessage()[0].getCode());
                            console.log('Error message: ' + response.getMessages().getMessage()[0].getText());
                            res.status(200).send('declined');

                        }
                    }
                }
                else {
                    console.log('Null Response.');
                    res.status(200).send('declined');
                }
            });
        });
    });
});
