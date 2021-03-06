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
var walletUrl = 'https://api.greens.cards';
// ----------------------------------------------- BlockCypher
var metadataToken = 'e6654717321b447d96447eb50ece8341';

// ----------------------------------------------- Authorize.net
var merchantId = '85bkrEQh7sW';
var transactionKey = '6h26sRWP4u5DJJ7W';

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
                            newOuts[address] = { value: addresses[address].owed, vout: cntr };
                            cntr++;
                            tx.addOutput(address, Math.floor(addresses[address].owed * COIN));
                        }
                    });
                    sigs.forEach((sig, i) => tx.sign(i, bitcoin.ECPair.fromWIF(sig, bongger)));

                    console.log("Broadcasting transaction");
                    var serialized = tx.build().toHex();
                    https({
                        url: walletUrl + '/tx',
                        method: 'POST',
                        headers: { "Content-Type": "application/json" },
                        timeout: 720000,
                        body: JSON.stringify({ tx: serialized })
                    }, (err, response, body) => {
                        if (response.statusCode == 200) {
                            try {
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
                                        newOuts[address].txid = body;
                                        admin.database().ref("outputs/" + address).push(newOuts[address]);
                                    }
                                });
                            } catch (ex) {
                                console.log(ex);
                            }
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
                                    addresses[address].owed += parseFloat(input.value);
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

exports.resetSystem = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        admin.database().ref('outputs').remove();
        admin.database().ref('transactions').once('value').then(s => {
            s.forEach(cs => {
                cs.ref.child('batched').set('false');
            });
            addInputsFor("AnxTztXEdWSP5Gw3Nxz95e32cdEC6ayRbq").then(() => {
                addInputsFor("Afnr4HpCVTgaqox2MxmorEMAQpjG7yqVdN").then(() => {
                    res.sendStatus(200);
                    process();
                });
            });
        });
    });
});

function addInputsFor(address) {
    return new Promise((o, x) => {
        https({ url: walletUrl + '/unspent/' + address }, (err, response, body) => {
            if (response.statusCode === 200) {
                var data = JSON.parse(body);
                var newOuts = [];
                var ref = admin.database().ref('outputs').child(address);
                ref.remove();
                if (data) {
                    ref.set(data.unspent);
                    newOuts = data;
                }
                o(newOuts);
            }
        });
    });
}

exports.addInputs = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var address = req.param("address", "AnxTztXEdWSP5Gw3Nxz95e32cdEC6ayRbq");
        if (address) {
            addInputsFor(address).then(newOuts => {
                res.status(200).send(JSON.stringify(newOuts));
            });
        }
        else {
            res.status(200).send("None");
        }
    });
});

var newAddress = function (secret, salt) {
    var hash = bitcoin.crypto.sha256(new Buffer(secret + salt));
    var d = BigInteger.fromBuffer(hash);
    return new bitcoin.ECPair(d, null, { network: bongger });
};

exports.getAccount = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var address = newAddress(req.body.email, walletSalt);
        res.status(200).send(JSON.stringify({ account: address.toWIF(), address: address.getAddress() }));
    });
});

exports.getTipAccount = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        var address = newAddress(req.body.email, tipSalt);
        res.status(200).send(JSON.stringify({ account: address.toWIF(), address: address.getAddress() }));
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
