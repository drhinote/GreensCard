angular.module('app.services', ['ionic.cloud','ionic.cloud.init','firebase'])
.factory('dogejs', ["$http", "$firebaseObject", "$firebaseArray", "$rootScope", "$ionicModal", function($http, $firebaseObject, $firebaseArray, $rootScope, $ionicModal) {
    
    var COIN = 100000000;
    var FEE = 25000;
    var info = { }
    var trans = { }
    var buckets
    
        var newAddress = function(secret) {
            var hash = coin.util.crypto.sha256(secret + ' whiskey india november')
            var d = coin.BigInteger.fromBuffer(hash)
            return new coin.util.ECPair(d)
        };
        var checkBalance =  function(address, callback) {
            $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + address })
            .then(function(result) {
               callback((result.data.balance/COIN).toFixed(2));
            });
        }
     
        var getSlot = function(cb) {    
            var id = Math.floor(((Math.random() * 899) + 100)) + '-' + Math.floor(((Math.random() * 899) + 100))
            var ref = firebase.database().ref("slots/" + id);
            ref.set({
                uid: info.value.uid || firebase.auth().currentUser.uid,
                id: id
            });
            info.value.slot = id;
            info.value.$save().then(function() {
                cb(id);
                ref.on('value', function(s) {
                    var ts = s.val();
                   if(!ts || ts.uid != info.value.uid) {
                        ref.off();
                       getSlot(cb);
                    }
            })
                
            })
        }
        
        var createTrans = function(from, to, amount, type) {
            return {
                signature: from.account,
                  from: { 
                    address: coin.util.ECPair.fromWIF(from.account).getAddress(),
                    uid: from.uid,
                    email: from.email
                },
                to: {
                    address: coin.util.ECPair.fromWIF(to.account).getAddress(),
                    uid: to.uid,
                    email: to.email
                },
                amount: amount,
                type: type,
                date: new Date()
            }
        }
        
        var addFee = function(tx, callback) {
            var wif = $firebaseObject(firebase.database().ref("feeWallet"));
            wif.$loaded().then(function(fee) {
                if(!fee.account) {
                    var addr = coin.util.ECPair.makeRandom();
                    wif.account = addr.toWIF();
                    wif.address = addr.getAddress();
                    wif.uid = "new-fee-wallet";
                    wif.$save().then(function() {
                    var trans = createTrans({ uid: "master", account: '6KTkNmVR977NGr6VjWCAb39Uyxp9a3TUZFSGtdfUNPSeR8H2Bz1' }, wif, 100, "deposit");
                    send(trans, function(res) {
                        if(!res.success) {
                            firebase.database().ref("criticalErrors").push().set({
                                message: "Unable to create new fee wallet for " + info.email + ": " + res.message
                            })
                        }
                        else {
                            firebase.database().ref("info").push().set({
                                message: "Created new fee wallet for " + info.email + ". Account# " + wif.account
                            })
                        }
                    });
                    })
                }
            var feeSig = coin.util.ECPair.fromWIF(wif.account);
            var feeAddress = feeSig.getAddress();
             $http({ url: 'https://dogechain.info/api/v1/unspent/' + feeAddress })
             .then(function success(result) {
                 var change = FEE;
                 var inputCount = 0;
                 for(i = 0; i < result.data.unspent_outputs.length && change > 0; i++)
                 {
                         var input = result.data.unspent_outputs[i]; 
                         change -= input.value;
                         tx.addInput(input.tx_hash, input.tx_output_n);
                         inputCount++;
                 }
                 if(inputCount === 0) {
                     callback(function(count) {
                         
                     })
                 } else {
                    if(change < 0)
                        tx.addOutput(feeAddress, -change);
                    callback(function(count) {
                      for(i = count; i < inputCount + count; i++) tx.sign(i, feeSig);
                    });
                 }
             })
            })
        }
        
        var send =  function(trans, callback) {
             $http({ url: 'https://dogechain.info/api/v1/unspent/' + trans.from.address })
             .then(function success(result) {
                 if(result.data.success == 1) {
                     var tx = new coin.util.TransactionBuilder();
                     var total = Math.floor(trans.amount*COIN);
                     var change = total;
                     var inputCount = 0;
                     for(i = 0; i < result.data.unspent_outputs.length && change > 0; i++)
                     {
                         var input = result.data.unspent_outputs[i]; 
                         change -= input.value;
                         tx.addInput(input.tx_hash, input.tx_output_n);
                         inputCount++;
                     }
                     if(change > 0) {
                         var status = { success: false, message: "Insufficient funds"};
                         callback(status);
                     }
                     else {
                         addFee(tx, function(signFee) {
                         tx.addOutput(trans.to.address, total);
                         if(change < 0) tx.addOutput(trans.from.address, -change);
                         for(i = 0; i < inputCount; i++) tx.sign(i, coin.util.ECPair.fromWIF(trans.signature));
                         signFee(inputCount);
                         var transaction = tx.build().toHex();
                         $http({  method: 'POST',
                                 url: 'https://dogechain.info/api/v1/pushtx',
                                 data: { tx: transaction } }).then(function(result) {
                                    if(result.data.success == 1) {
                                        trans.script = transaction;
                                        trans.hash = result.data.tx_hash;
                                        var key = firebase.database().ref("transactions/all").push().key;
                                        var updates = {}
                                        updates["/transactions/all/" + key] = trans;
                                        updates["/transactions/" + trans.from.uid + '/' + key] = trans;
                                        updates["/transactions/" + trans.to.uid + '/' + key] = trans;
                                        firebase.database().ref().update(updates);
                                        var fromBal = $firebaseObject(firebase.database().ref('info/' + trans.from.uid + '/balance'))
                                        fromBal.$loaded().then(function(bal) {
                                            fromBal.$value = (fromBal.$value || 0) - trans.amount;
                                            fromBal.$save();
                                        });
                                        var toBal = $firebaseObject(firebase.database().ref('info/' + trans.to.uid + '/balance'))
                                        toBal.$loaded().then(function(bal) {
                                            toBal.$value = (toBal.$value || 0) + trans.amount;
                                            toBal.$save();
                                        });
                                         callback({ success: true, message: 'Payment Complete' });
                                    } else {
                                         callback({ success: false, message: 'Payment rejected by the network' });
                                    }
                                });
                         });
                     }                 
                 } else {
                    var r1 = { success: false, message: result.data.error };
                     callback(r1);
                 }
                 
                })
            }
            
    var ask = function(scope, callback) {
                  scope.modal = $ionicModal.fromTemplate('<ion-modal-view><br/><br/><h3> Incoming payment request</h3><br/><br/><p> Total: {{ bucket.amount }}</p><br/><br/><button ng-click="close(true)" class="button button-balanced button-block">Approve</button><br/><button ng-click="close(false)" class="button button-balanced button-block">Decline</button></ion-modal-view>', { scope: scope });
                  scope.close = function(approved) { 
                    scope.modal.hide();
                    if(callback) callback(approved);
                  }
                  scope.modal.show();
        }
    var payment = 'payment',
        refund = 'refund',
        deposit = 'deposit',
        withdrawal = 'withdrawal';
        /*
            event: The database event type which fired (child_added, child_moved, child_removed, or child_changed).
            key: The ID of the record that triggered the event.
            prevChild: If event is child_added or child_moved, this contains the previous record’s key or null if key belongs to the first record in the collection
*/

var unwatchBucket
         var handleRequests = function() {
                if(buckets.processing) return;
                    try {
                        if(unwatchBucket) unwatchBucket();
                        
                        var parent = $rootScope;
                        var child = parent.$new(true);
                            child.bucket = buckets;
                            buckets.message = "Hi, this message is from the customer's device.  I'm asking if this payment should be made while you are reading this...";
                            buckets.processing = true;
                            buckets.$save();
                            ask(child, function(approved) {
                                if(approved) {
                                    buckets.message = "Approved, tendering payment";
                                    buckets.$save();
                                    var trans = createTrans(info.value, buckets.to, buckets.amount, buckets.type);
                                    send(trans, function(res) {
                                        if(res.success) {
                                            buckets.completed = true;
                                        }
                                        else {
                                            buckets.failed = true;
                                            buckets.message = "Hmm, there was some kind of error.  Get this message to the boys back at the lab: " + res.message;
                                        }
                                        buckets.$save();
                                    })
                                }
                                else {
                                    buckets.declined = true;
                                    buckets.message = "Well, they said no, perhaps some haggling will help?  Remember to start, er, high...";
                                    buckets.$save();
                                }
                            
                            })
                    } finally {
                        unwatchBucket = buckets.$watch(handleRequests);
                    }
                
            }
    return {
        info: info,
        refreshSlot: getSlot,
        transactions: trans,
        buckets: buckets,
        signIn: function(user, cb) {
            $firebaseObject(firebase.database().ref("info/" + user.uid)).$loaded().then(function(infoVal) {
                info.value = infoVal;
                info.value.balance = info.value.balance || 0.0;
                info.value.account = info.value.account || newAddress(user.email).toWIF();
                info.value.uid = info.value.uid || user.uid;
                info.value.email = info.value.email || user.email;
                info.value.slot = info.value.slot || '000-000';
                info.value.$save().then(function() {
                    checkBalance(coin.util.ECPair.fromWIF(info.value.account).getAddress(), function(networkVal) {
                        if(networkVal > info.value.balance+0.01 || networkVal < info.value.balance-0.01) {
                            firebase.database().ref("balanceErrors").push().set({
                                user: info.value.email, 
                                network: networkVal, 
                                local: info.value.balance 
                            });
                            info.value.balance = networkVal;
                            info.value.$save();
                        }
                    })
                    trans.value = $firebaseArray(firebase.database().ref("transactions/" + info.value.uid).limitToLast(25));
                    buckets = $firebaseObject(firebase.database().ref("buckets/" + info.value.uid));
                    unwatchBucket = buckets.$watch(handleRequests);
                    cb(true);
                
            })
            })
        },
        signOut: function() {
            info.value.$destroy();
            trans.value.$destroy();
            buckets.$destroy();
        },
        withdraw: function(amount, callback) {
            var trans = createTrans(info.value, { uid: "master", account: '6KTkNmVR977NGr6VjWCAb39Uyxp9a3TUZFSGtdfUNPSeR8H2Bz1' }, amount, withdrawal);
            send(trans, callback);
        }, 
        deposit: function(amount, callback) {
            var trans = createTrans({ uid: "master", account: '6KTkNmVR977NGr6VjWCAb39Uyxp9a3TUZFSGtdfUNPSeR8H2Bz1' }, info.value, amount, deposit);
            send(trans, callback);
        },
        refundTransaction: function(trans, scope, callback) {
                ask("New Refund Request", trans.amount, scope, function(approved) {
                 if(approved) {
                    var newTrans = createTrans(trans.to, trans.from, trans.amount, refund);
                     send(trans, callback);
                 }
                })
        },
        sendRefund: function(slot, amount, scope) {
                var toUid = $firebaseObject(firebase.database().ref("slots/" + slot))
                toUid.uid = null;
                toUid.$save()
                    
                ask("New Refund Request", amount, scope, function(approved) {
                if(approved) {
                    $firebaseObject(firebase.database().ref('info/' + toUid)).$loaded(function(res) { 
                    var newTrans = createTrans(info.value, res, amount, refund);
                     send(newTrans, callback);
                    })
                }
            })
        },
        waitForPayment: function(slot, amount, cb) {
         
                $firebaseObject(firebase.database().ref('slots/' + slot)).$loaded().then(function(elSlot) {
                $firebaseObject(firebase.database().ref("buckets/" + elSlot.uid)).$loaded().then(function(bucket) {
                    if(elSlot.uid != info.value.uid) {
                elSlot.$remove();
                var parent = $rootScope;
                var child = parent.$new(true);
                child.bucket = bucket;
                bucket.amount = amount;
                bucket.type = payment;
                bucket.to = info.value;
                bucket.processing = false;
                bucket.$save();
                bucket.message = "According to my calculations, your customer will be asked to approve this payment soon";
                child.modal = $ionicModal.fromTemplate('<ion-modal-view><br/><br/><h3> Ye Olde Payment Dialog</h3><br/><br/><p> {{ bucket.message }}</p><br/><br/><div class="button button-clear icon-left ion-android-checkmark-circle" ng-if="bucket.completed">Payment Complete</div><div class="button button-clear icon-left ion-alert-circled" ng-if="bucket.declined">Payment Declined</div><div class="button button-clear icon-left ion-alert-circled" ng-if="bucket.failed">Payment Error</div><button ng-click="close()" class="button button-balanced button-block icon-left ion-close">Go Back</button><div id="firebaseui-auth-container"></div></ion-modal-view>', {
                    scope: child
                  });
                    
                    child.close = function() {
                        child.modal.hide();
                    }
                    child.modal.show();
                    }
                    else {
                        if(cb) cb("Please don't try to send yourself a payment, it will break the internet...")
                    }
                    })
                })
                }
            }
        }
    
])