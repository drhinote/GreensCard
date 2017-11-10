angular.module('app.services', ['ionic.cloud', 'ionic.cloud.init', 'firebase'])
    .factory('dogejs', ["$http", "$firebaseObject", "$firebaseArray", "$rootScope", "$ionicModal", "$state", "$timeout", function ($http, $firebaseObject, $firebaseArray, $rootScope, $ionicModal, $state, $timeout) {
        var feeWallet = { uid: "profit", address: "DJi1eo9Hv5nJH9fJK8YydCmsrfTemBfM6m", account: "6KDKt1GJiath11Y8cWsQom78fkHjUWis73492y4XeAAYdi8wAvf", email: "help@greens-card.com" };
        var withdrawalFeeWallet = { uid: "withdrawal", address: "DCLPBm6kND8ZWwyn4WYYpGbbxfk5DHZouG", account: "6JQ2M6noanNM7xw8Ayu8ewxWmLiPdNVTgK4roicQx4HeA81zT1U", email: "help@greens-card.com" };
        var wallet;
        var tipWallet;
        var dogecoin = {
            messagePrefix: '\x19Dogecoin Signed Message:\n',
            bip32: {
                public: 0x02facafd,
                private: 0x02fac398
            },
            pubKeyHash: 0x1e,
            scriptHash: 0x16,
            wif: 0x9e
        };
        const COIN = 100000000;
        const FEE = 25000;
        var isMerchant = false;
        var settled = 0;
        var tips = 0;
        var info = {};
        info.value = {};
        var slot = {};
        var reloadScope = {};
        var buyScope = {};
        var manageScope = {};
        slot.value = '';

        var pending = 0;
        var current = 0;
        var transactions;
        var bucketsRef;
        var slotRef;
        var profileRef;

        var websocket;
        var timer;
        var updates = {};

        var reopen = () => {
            websocket = new WebSocket("wss://socket.blockcypher.com/v1/doge/main");
            websocket.onmessage = function (event) {
                if (event.data) {
                    var tx = JSON.parse(event.data);
                    if (tx.addresses) {
                        tx.addresses.forEach(item => { if (updates[item]) updates[item](); });
                    }
                }
            };
            var ping = () => {
                websocket.send(JSON.stringify({ event: "ping" }));
                timer = $timeout(ping, 20000);
            };
            websocket.onopen = function (event) {
                websocket.send(JSON.stringify({ event: "unconfirmed-tx" }));

            };

            websocket.onclose = function (event) {
                if (timer) $timeout.cancel(timer);
                reopen();
            };
        };

        var logoff = function () {
            settled = 0;
            wallet = undefined;
            tipWallet = undefined;
            tips = 0;
            if (transactions) transactions.$destroy();
            slot.value = '';
            if (websocket) websocket.close();
            if (slotRef) slotRef.off();
            if (bucketsRef) bucketsRef.off();
            if (profileRef) profileRef.off();
        };

        var getAddress = function (email, label, callback) {
            $http({
                url: `https://us-central1-greenscard-177506.cloudfunctions.net/get${label}/`,
                method: 'POST',
                data: { email: email },
            }).then(function (token) {
                callback(token.data);
            });
        };
        var getSettledBalance = (callback) => {
            $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + info.value.address + '/balance' }).then(function (result) {
                settled = (result.data.final_balance / COIN).toPrecision(2);
                if (isMerchant === true) {
                    $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + info.value.tipAddress + '/balance' }).then(function (result2) {
                        tips = (result2.data.final_balance / COIN).toPrecision(2);
                        callback(settled);
                    }).catch(err2 => {
                        console.log(err2);
                        callback(settled);
                    });
                }
                else {
                    callback(settled);
                }
            });
        }
        
        /*
        var getSettledBalance = (callback) => {
            $http({ url: 'https://dogechain.info/api/v1/unspent/' + wallet.address }).then(function (result) {
                tips = 0;
                settled = 0;
                result.data.unspent_outputs.forEach(output => {
                    firebase.database().ref("txHash/" + output.tx_hash).once('value').then(s => {
                        if (s.exists()) {
                            settled += parseFloat(output.value) / COIN;
                        }
                    });
                });
                if (isMerchant === true) {
                    $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + tipWallet.address + '/balance?unspentOnly=true&includeConfidence=false&includeScript=false' }).then(function (result2) {
                        result.data.txrefs.forEach(output => {
                            firebase.database().ref("txHash/" + output.tx_hash).once('value').then(s => {
                                if (s.exists()) {
                                    tips += parseFloat(output.value) / COIN;
                                }
                            });
                            callback(settled);
                        }).catch(err2 => {
                            console.log(err2);
                            callback(settled);
                        })
                    });
                };
            })
        };
        */
        var checkBalance = () => {
            var pending = 0;
            var tipsPending = 0;

            transactions.forEach(trans => {
                if (trans.batched === "false") {
                    var isMine = trans.from.uid == info.value.uid;
                    pending += isMine ? trans.amount : -trans.amount;
                    if (isMerchant) {
                        tipsPending += isMine ? trans.tip : -trans.tip;
                    }
                }
            });
            info.value.balance = (settled - pending).toFixed(2);
            info.value.tipsBal = (tips - tipsPending).toFixed(2);
            /*    if (reloadScope.value) {
                    reloadScope.value.$apply();
                }
                if (buyScope.value) {
                    buyScope.value.$apply();
                }
                if (manageScope.value) {
                    manageScope.value.$apply();
                }*/
            return info.value.balance;
        };

        var getSlot = function () {
            if (firebase.auth().currentUser) {
                if (slotRef) slotRef.off();
                slot.value = Math.floor((Math.random() * 899999) + 100000);
                slotRef = firebase.database().ref("slots/" + slot.value);
                slotRef.set({
                    uid: info.value ? info.value.uid : firebase.auth().currentUser.uid,
                    email: info.value ? info.value.email : firebase.auth().currentUser.email,
                    address: wallet.address,
                    id: slot.value
                }).then(bb => {
                    slotRef.onDisconnect().remove();
                    slotRef.on('value', function (s) {
                        var ts = s.val();
                        if (!s.exists() || ts.uid != firebase.auth().currentUser.uid) {
                            getSlot();
                        }
                    });
                });
            }
            else {
                logoff();
                $state.go('login');
            }
        }

        var blindTrans = function (from, to, amount, type, tip, details, merchant, customer) {
            return {
                signature: from.account,
                from: from,
                to: to,
                batched: "false",
                merchant: merchant,
                customer: customer,
                details: details,
                amount: parseFloat(amount),
                tip: parseFloat(tip),
                type: type,
                date: new Date().toISOString()
            }
        };


        var send = trans => {
            return firebase.database().ref("transactions/" + (Number.MAX_SAFE_INTEGER - new Date(trans.date).getTime())).set(trans);
        };

        var payment = 'payment',
            refund = 'refund',
            deposit = 'deposit',
            withdrawal = 'withdrawal';
        var cancelRef, continueRef;
        /*
            event: The database event type which fired (child_added, child_moved, child_removed, or child_changed).
            key: The ID of the record that triggered the event.
            prevChild: If event is child_added or child_moved, this contains the previous record’s key or null if key belongs to the first record in the collection
    */

        var ask = function (bucket, callback) {
            var parent = $rootScope;
            var child = parent.$new(true);
            child.bucket = bucket;

            child.setTip = amount => {
                bucket.tip = amount.toFixed(2);
            };
            child.modal = $ionicModal.fromTemplate('<ion-modal-view padding="true" style="padding: 6px"><ion-content><br/><h4>Payment Requested</h4><br/>Amount: {{ bucket.amount | number : 2 }}<br/>' +
                '<div ng-show="bucket.fee && (bucket.fee > 0)">Processing fee: {{ bucket.fee | number : 2 }}<br/></div>' +
                '<div ng-show="bucket.tipsEnabled">Show your appreciation<div class="button-bar">' +
                '<button ng-click="setTip(bucket.pct5)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct5.toFixed(2) }}</button>' +
                '<button ng-click="setTip(bucket.pct10)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct10.toFixed(2) }}</button>' +
                '<button ng-click="setTip(bucket.pct15)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct15.toFixed(2) }}</button>' +
                '</div>' +
                '<form class="list">' +
                '<label class="item item-input">' +
                '<span class="input-label">Tip</span>' +
                '<input type="text" placeholder="" ng-model="bucket.tip">' +
                '</label>' +
                '</form></div>' +
                '<br/><button ng-click="close(true)" class="button button-balanced button-block">Approve</button><br/><br/><button ng-click="close(false)" class="button button-balanced button-block">Decline</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-content></ion-modal-view>', {
                    scope: child
                });

            child.close = function (approved) {
                callback(approved);
                child.modal.hide();
            };
            child.modal.show();
        };

        var handleRequests = function (s) {
            if (s.exists()) {
                var bucket = s.val();
                if (!bucket.amount) return;
                s.ref.onDisconnect().remove();
                s.ref.child('spent').set('true').then(() => {

                    if (bucket.spent) return;
                    s.ref.child('message').set("Waiting for the customer's response");
                    var fee = bucket.fee ? parseFloat(bucket.fee) : 0.0;
                    var bal = checkBalance();

                    if ((bucket.amount + fee) <= bal) {
                        ask(bucket, function (approved) {
                            if (approved) {
                                s.ref.update({
                                    title: "Payment approved",
                                    processing: true,
                                    message: "The payment will be on it's way soon"
                                });
                                var rand = Math.random() * 100;
                                bucket.tip = parseFloat(bucket.tip).toPrecision(2);
                                var trans = blindTrans(info.value, bucket.to, bucket.amount, 'payment', (bucket.tip > 0 && bucket.tip + bucket.amount + fee <= bal) ? bucket.tip : 0, { transactionFee: fee }, bucket.to.uid, info.value.uid);
                                send(trans).then(() => {
                                    s.ref.update({
                                        title: "Payment Complete",
                                        processing: false,
                                        completed: true,
                                        message: "Thank you for using our service" + (rand > 98.0 ? ", I'm getting a little verklempt!" : "")
                                    });
                                    if (fee > 0) {
                                        var feeTrans = blindTrans(info.value, feeWallet, fee, 'fee', 0, { transaction: trans }, "master", info.value.uid);
                                        send(feeTrans);
                                    }
                                    if (bucket.tip > 0 && bucket.tip + bucket.amount + fee <= bal) {
                                        var tipTrans = blindTrans(info.value, bucket.tipTo, bucket.tip, 'tip', 0, { transaaction: trans }, "tip" + bucket.to.uid, info.value.uid);
                                        send(tipTrans);
                                    }
                                }).catch(err => {
                                    s.ref.update({
                                        title: "Payment Failed",
                                        processing: false,
                                        failed: true,
                                        message: "There was some kind of error: " + err
                                    });
                                    console.log(err);
                                });
                            }
                            else {
                                s.ref.update({
                                    declined: true,
                                    title: "Payment Declined",
                                    message: "Well, the customer said no"
                                });
                            }

                        });
                    } else {
                        s.ref.update({
                            title: "Payment Error",
                            processing: false,
                            completed: false,
                            failed: true,
                            message: "Insufficient funds"
                        });
                    }
                });
            }

        };

        var tipping;
        var defaultConfig = {};
        var tts = {};

        return {
            setMerchant: isStore => isMerchant = isStore,
            info: info,
            feeConfig: defaultConfig,
            getWithdrawConfig: callback => {
                firebase.database().ref('merchants/' + info.value.uid).once('value').then(t => {
                    var feeConfig = t.val();
                    if (!feeConfig) {
                        feeConfig = defaultConfig.value;
                    } else {
                        if (!(feeConfig.withdrawalFlatFee || parseFloat(feeConfig.withdrawalFlatFee) === 0)) {
                            feeConfig.withdrawalFlatFee = defaultConfig.value.withdrawalFlatFee;
                        }
                        if (!(feeConfig.withdrawalPercent || parseFloat(feeConfig.withdrawalPercent) === 0)) {
                            feeConfig.withdrawalPercent = defaultConfig.value.withdrawalPercent;
                        }
                    }
                    callback(feeConfig);
                });
            },
            refreshSlot: getSlot,
            slot: slot,
            transactions: tts,
            reloadScope: reloadScope,
            manageScope: manageScope,
            buyScope: buyScope,
            setTips: isEnabled => {
                tipping = isEnabled;
                firebase.database().ref('merchants/' + info.value.uid + '/tipsEnabled').set(isEnabled);
            },
            getTips: callback => {
                if (tipping === null || tipping === undefined) {
                    firebase.database().ref('merchants/' + info.value.uid + '/tipsEnabled').once('value').then(s => {
                        if (!s.exists()) {
                            s.ref.set(false);
                            tipping = false;
                            callback(false);
                        } else {
                            tipping = s.val() === true;
                            callback(tipping);
                        }
                    });
                } else {
                    callback(tipping);
                }
            },
            doubleCheck: () => {
                getSettledBalance(bal => {
                    checkBalance();
                });
            },
            removeProfile: function () {
                firebase.database().ref("info/" + info.value.uid + "/profileSaved").remove();
            },
            signIn: function (userz, cb) {
                logoff();
                var user = firebase.auth().currentUser;
                info.value.uid = user.uid;
                info.value.email = user.email;
                firebase.database().ref('info/' + user.uid).update(info.value);
                info.value.balance = 0;
                info.value.tipsBal = 0;
                profileRef = firebase.database().ref("info/" + user.uid + "/profileSaved");
                profileRef.on('value', s => {
                    if (s.exists()) {
                        if (reloadScope.value)
                            reloadScope.value.$apply(() => info.value.profileSaved = s.val());
                        else
                            info.value.profileSaved = s.val();
                    } else {
                        info.value.profileSaved = null;
                    }
                });
                transactions = tts.value = $firebaseArray(firebase.database().ref("transactions").orderByChild(isMerchant ? "merchant" : "customer").equalTo(user.uid).limitToFirst(100));
                transactions.$loaded().then(() => {
                    getAddress(user.email, "Account", localWallet => {
                        wallet = localWallet;

                        info.value.account = wallet.account;
                        info.value.address = wallet.address;
                        updates[wallet.address] = () => {
                            getSettledBalance(bal => {
                                cb(checkBalance());
                            });
                        };

                        getSlot();
                        firebase.database().ref("email2uid/" + user.email.replace(new RegExp('@', 'g'), '-').replace(new RegExp('\\.', 'g'), '_')).set({ uid: user.uid, account: info.value.account });
                        bucketsRef = firebase.database().ref("buckets/" + user.uid);
                        bucketsRef.on("child_added", handleRequests);
                        transactions.$watch(checkBalance);

                        var startup = () => {
                            defaultConfig.value = $firebaseObject(firebase.database().ref('merchants/000default'));
                            defaultConfig.value.$loaded().then(() => {
                                getSettledBalance(bal => {
                                    cb(checkBalance());
                                });
                            });
                        };
                        if (isMerchant) {
                            getAddress(user.email, "TipAccount", localTipWallet => {
                                tipWallet = localTipWallet;
                                info.value.tipAccount = tipWallet.account;
                                info.value.tipAddress = tipWallet.address;
                                updates[tipWallet.address] = () => {
                                    getSettledBalance(bal => {
                                        cb(checkBalance());
                                    });
                                };
                                startup();
                            });
                        } else {
                            startup();
                        }
                    });
                });
            },
            signOut: logoff,
            withdraw: function (amount, flatFee, fee, callback) {
                var to = {
                    email: 'help@greens-card.com',
                    uid: "master",
                    address: 'D6EcoVuudkLPDYFbRzhJ3mhQLuUBB1FBjt'
                };
                var withdrawalTrans = blindTrans(info.value, to, parseFloat(amount) - (parseFloat(fee || 0) + parseFloat(flatFee || 0)), "withdrawal", 0, {
                    withdrawalFlatFee: parseFloat(flatFee || 0),
                    withdrawalFee: parseFloat(fee || 0)
                }, info.value.uid, "master");
                send(withdrawalTrans).then(() => {
                    firebase.database().ref("withdrawals/" + (Number.MAX_SAFE_INTEGER - new Date(withdrawalTrans.date).getTime())).set({
                        email: info.value.email,
                        uid: info.value.uid,
                        amount: parseFloat(amount),
                        fee: parseFloat(fee || 0),
                        flatFee: parseFloat(flatFee || 0),
                        date: new Date().toISOString(),
                        trans: withdrawalTrans,
                        isTipWithdraw: false
                    });
                    if (fee > 0) {
                        var feeTrans1 = blindTrans(info.value, feeWallet, parseFloat(fee), 'fee', 0, { trans: withdrawalTrans }, info.value.uid, "withdraw Fee");
                        send(feeTrans1, function (res2) { });
                    }
                    if (flatFee > 0) {
                        var feeTrans2 = blindTrans(info.value, withdrawalFeeWallet, parseFloat(flatFee), 'fee', 0, { trans: withdrawalTrans }, info.value.uid, "withdraw FlatFee");
                        send(feeTrans2, function (res3) { });
                    }
                    callback({ success: true, message: "Withdrawal successful" });
                }).catch(err => {
                    console.log(err);
                    callback({ success: false, message: "Withdrawal failed" });
                });
            },
            withdrawTips: function (amount, callback) {
                var tipSig = tipWallet;
                var to = {
                    email: 'help@greens-card.com',
                    uid: "master",
                    address: 'D6EcoVuudkLPDYFbRzhJ3mhQLuUBB1FBjt'
                };
                var withdrawalTrans = blindTrans({ email: info.value.email, uid: info.value.uid, account: tipSig.account, address: tipSig.address }, to, 0, "withdraw Tips", parseFloat(amount), {}, info.value.uid, "master");
                send(withdrawalTrans).then(() => {
                    firebase.database().ref("withdrawals").push({
                        email: info.value.email,
                        uid: info.value.uid,
                        amount: parseFloat(amount),
                        date: new Date().toISOString(),
                        fee: 0,
                        flatFee: 0,
                        trans: withdrawalTrans,
                        isTipWithdraw: true
                    });
                    var act = blindTrans({ email: info.value.email, uid: info.value.uid, account: tipSig.account, address: tipSig.address }, to, parseFloat(amount), "withdraw Tips", 0, {}, "tip" + info.value.uid, "master");
                    send(act);
                    callback({ success: true, message: "Withdrawal successful" });
                }).catch(err => {
                    console.log(err);
                    callback({ success: false, message: "Withdrawal failed" });
                });

            },
cancel: function (callback) {
    cancelRef = firebase.database().ref('control/' + info.value.uid + '/cancel');
    cancelRef.on('value', function (s) {
        var ok = s.val();
        if (ok) {
            if (continueRef) {
                continueRef.off();
                continueRef.remove();
            }
            if (cancelRef) {
                cancelRef.off();
                cancelRef.remove();
            }
            callback();
        }
    });
},
continue: function (callback) {
    continueRef = firebase.database().ref('control/' + info.value.uid + '/continue');
    continueRef.on('value', function (s) {
        var ok = s.val();
        if (ok) {
            if (continueRef) {
                continueRef.off();
                continueRef.remove();
            }
            if (cancelRef) {
                cancelRef.off();
                cancelRef.remove();
            }
            callback();
        }
    });
},
controlOff: function () {
    if (continueRef) {
        continueRef.off();
        continueRef.remove();
    }
    if (cancelRef) {
        cancelRef.off();
        cancelRef.remove();
    }
},
setSaveProfile: function (value) {
    firebase.database().ref("email2uid/" + info.value.email.replace("@", "-").replace(".", "_") + "/saveInfo").set(value);
},
getDepositToken: function (amount, callback) {
    $http({
        url: 'https://us-central1-greenscard-177506.cloudfunctions.net/getToken',
        method: 'POST',
        data: {
            amount: amount,
            email: info.value.email,
            uid: info.value.uid
        }
    }).then(function (token) {
        if (token.data && token.data.length > 1000) {
            callback({ success: true, message: token.data });
        }
        else {
            callback({ success: false, message: "Error getting payment form" });
        }
    });
},
refundTransaction: function (trans, cb) {
    if (trans.to.uid == info.value.uid) {
        var fee = (trans.details && trans.details.transactionFee) ? parseFloat(trans.details.transactionFee) : 0.0;
        var trans2 = blindTrans(info.value, trans.from, parseFloat(trans.amount), 'refund', -(parseFloat(trans.tip) || 0), { transactionFee: fee }, info.value.uid, trans.from.uid);
        send(trans2, function (res) {
            if (res.success) {
                var time = Number.MAX_SAFE_INTEGER - new Date(trans.date).getTime();
                firebase.database().ref('transactions/' + time + '/refunded').set('true');
                if (fee > 0) {
                    var feeTrans = blindTrans(feeWallet, trans.from, fee, 'fee Refund', 0, { transaction: trans2 }, "master", trans.from.uid);
                    send(feeTrans, function (res2) { });
                }
                if (trans.tip > 0) {
                    var tipRefundFrom = { email: info.value.email, address: tipWallet.address, account: tipWallet.account, uid: "tip" + info.value.uid };
                    var tipTrans = blindTrans(tipRefundFrom, trans.from, trans.tip, 'tip Refund', 0, { transaction: trans2 }, "tip" + info.value.uid, trans.from.uid);
                    send(tipTrans);
                }
            }
            cb(res);
        })
    }
},
sendRefund: function (slot, amount, cb) {
    var tempSlot = firebase.database().ref('slots/' + slot);
    tempSlot.once('value').then(function (s) {
        var elSlot = s.val();
        tempSlot.remove();
        if (elSlot.uid == info.value.uid) {
            if (cb) cb("Please don't try to send yourself a payment, it will break the internet...");
            return;
        }
        var trans = blindTrans(info.value, elSlot, amount, 'refund', 0, { transactionFee: 0.0 }, info.value.uid, elSlot.uid);
        send(trans, function (res) {
            if (res.success) {
                cb("Refund complete");
            }
        })
    })
},
waitForPayment: function (slot, amount, cb) {

    var tempSlot = firebase.database().ref('slots/' + slot);
    tempSlot.once('value').then(function (s) {
        var elSlot = s.val();
        if (!elSlot || !elSlot.uid) {
            if (cb) cb("Invalid greens code, please try again");
            return;
        }
        tempSlot.remove();
        if (elSlot.uid == info.value.uid) {
            if (cb) cb("Can not request payment from that account");
            return;
        }

        var parent = $rootScope;
        var child = parent.$new(true);

        firebase.database().ref('merchants/' + info.value.uid).once('value').then(t => {
            var feeConfig = t.val();
            var te = feeConfig.tipsEnabled;
            if (!feeConfig) {
                feeConfig = defaultConfig.value;
            } else {
                if (!(feeConfig.transactionFlatFee || parseFloat(feeConfig.transactionFlatFee) === 0)) {
                    feeConfig.transactionFlatFee = defaultConfig.value.transactionFlatFee;
                }
                if (!(feeConfig.transactionPercent || parseFloat(feeConfig.transactionPercent) === 0)) {
                    feeConfig.transactionPercent = defaultConfig.value.transactionPercent;
                }
            }

            child.bucket = $firebaseObject(firebase.database().ref("buckets/" + elSlot.uid).push({
                active: slot,
                amount: amount,
                pct5: parseFloat((amount * 0.05).toFixed(2)),
                pct10: parseFloat((amount * 0.10).toFixed(2)),
                pct15: parseFloat((amount * 0.15).toFixed(2)),
                pct20: parseFloat((amount * 0.20).toFixed(2)),
                tip: 0,
                fee: feeConfig ? ((feeConfig.transactionPercent ? parseFloat(amount) * (parseFloat(feeConfig.transactionPercent) / 100.0) : 0.0) + (feeConfig.transactionFlatFee ? parseFloat(feeConfig.transactionFlatFee) : 0.0)).toFixed(2) : null,
                processing: false,
                completed: false,
                failed: false,
                declined: false,
                to: { email: info.value.email, address: wallet.address, uid: info.value.uid },
                tipTo: { email: info.value.email, address: tipWallet.address, uid: "tip" + info.value.uid },
                tipsEnabled: te,
                message: "If this message doesn't change for more than 30 seconds, press 'Go Back' and retry the payment.",
                title: "Request Sent"
            }));

            child.bucket.$loaded().then(function () {
                child.modal = $ionicModal.fromTemplate('<ion-modal-view><ion-content><br/><br/><h3>{{ bucket.title }}</h3><br/><br/><p>{{ bucket.message }}</p><br/><br/><button class="button button-light button-block" ng-click="close()" ng-show="bucket.processing">Payment in Progress</button><button class="button button-balanced button-block icon-left ion-android-checkmark-circle" ng-click="close()" ng-show="bucket.completed">Payment complete</button><button class="button button-energized button-block icon-left ion-alert-circled"  ng-click="close()" ng-show="bucket.declined">Payment Declined</button><button class=button button-balanced button-block icon-leftion-alert-circled"  ng-click="close()" ng-show="bucket.failed">Payment Error</button><button ng-click="close()" ng-show="!(bucket.declined||bucket.completed||bucket.failed)" class="button button-balanced button-block icon-left ion-close">Go Back</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-content></ion-modal-view>', {
                    scope: child
                });

                child.close = function () {
                    child.modal.hide();
                    child.bucket.$remove();
                };
                child.modal.show();
            });
        });
    });
}
        };
    }

    ]);
