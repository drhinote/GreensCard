angular.module('app.services', ['ionic.cloud','ionic.cloud.init','firebase'])
.factory('payment', [function() {
    
}])
.factory('dogejs', ["$http", "$firebaseObject", "$firebaseArray", "$rootScope", "$ionicModal", "$state", "$timeout", function($http, $firebaseObject, $firebaseArray, $rootScope, $ionicModal, $state, $timeout) {
    
    var COIN = 100000000;
    var FEE = 25000;
    var info = { };
    var buckets;
    var trans = {};
    var deposits = {};
    var depositsRef;
    var transRef;
    var nextBroadcast;
    var currentSlot = { };
            
        var newAddress = function(secret) {
            var hash = coin.util.crypto.sha256(secret + ' whiskey india november')
            var d = coin.BigInteger.fromBuffer(hash)
            return new coin.util.ECPair(d)
        };
        var checkBalance =  function(address, callback) {
            $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + address + "/balance" })
            .then(function(result) {
               callback((result.data.final_balance/COIN).toFixed(2));
            });
        }
     var logoff = function() {
            if(info.value) info.value.$destroy();
            info.value = null;
            if(transRef) transRef.off();
            if(depositsRef) depositsRef.off();
            if(buckets) buckets.off();
            if(nextBroadcast) $timeout.cancel(nextBroadcast);
            nextBroadcast = undefined;
            if(batchRef) batchRef.off();
            batchRef = undefined;
        };
     var oldSlot
        var getSlot = function() {    
            if(firebase.auth().currentUser) {
			if(oldSlot) oldSlot.off();
            currentSlot.value = Math.floor(((Math.random() * 899) + 100)) + '-' + Math.floor(((Math.random() * 899) + 100));
            oldSlot = firebase.database().ref("slots/" + currentSlot.value);
            oldSlot.set({
                uid: firebase.auth().currentUser.uid,
                id: currentSlot.value
            }).then(bb => {
                oldSlot.onDisconnect().remove();
                oldSlot.on('value', function(s) {
                    var ts = s.val();
                    if(!s.exists() || ts.uid != firebase.auth().currentUser.uid) {
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
                amount: parseFloat(amount),
                type: type,
                date: new Date().toISOString()
            }
        }
        
        var block = function(cb) {
            $http({
                url: 'https://dogechain.info/chain/Dogecoin/q/getblockcount'
            }).then(function(res) {
                cb(res.data);
            })
        };
        
        var addFee = function(tx, cb) {
                
                firebase.database().ref("feeWallet").once('value').then(function(s) {
                    var fee = s.val();
                    var feeAddress = fee.address;
            
                $http({ url: 'https://dogechain.info/api/v1/unspent/' + feeAddress })
                .then(function success(result) {
                    var feeChange = FEE;   
                    var ipc = 0;
                    angular.forEach(result.data.unspent_outputs, function(input) {
                        feeChange -= input.value;
                        tx.addInput(input.tx_hash, input.tx_output_n);
                        ipc++;
                    })
    
                    if(feeChange < 0) {
                        tx.addOutput(feeAddress, -feeChange);
                    }
                     
                    cb(function(count) {
                            for(var i = count; i < count+ipc; i++) {
                                tx.sign(i, coin.util.ECPair.fromWIF(fee.account));
                            }
                        });
                });
            });
        };
        
        var batchRef;
        var batch;
        var use2 = false;
        var broadcast = function(callback) {
            
                block(function(num) {
                    if(!batch || batch.input != info.value.account) {
                        batch = {
                            block: 0,
                            input: info.value.account,
                            outputs: { }
                        }
                    }
                    if(!batch.block) batch.block = num;
                    if(!batch.input) batch.input = info.value.account;
                    
            var batchId = "batches/" + coin.util.ECPair.fromWIF(info.value.account).getAddress();
           try {
                if(nextBroadcast) {
                    $timeout.cancel(nextBroadcast);
                    nextBroadcast = undefined;
                }
                    if(!batchRef) { 
                        batchRef = firebase.database().ref(batchId);
                        batchRef.once('value').then(function(s) {
                            var b = s.val();
                            if(b) {
                                angular.forEach(b.outputs, function(value, key) {
                                    if(!batch.outputs[key]) batch.outputs[key] = { };
                                    angular.forEach(value, function(tranny, k2)  {
                                        batch.outputs[key][k2] = tranny;
                                    });
                                });
                            } 
                        });
                    }
                    if(Object.keys(batch.outputs).length > 0 && num != batch.block) {
                      
                        var tx = new coin.util.TransactionBuilder();
                        var from = coin.util.ECPair.fromWIF(batch.input);
                        $http({ url: 'https://dogechain.info/api/v1/unspent/' + from.getAddress() })
                        .then(function success(result) {
                            var thisBatch = { };
                            Object.keys(batch.outputs).forEach(kk => thisBatch[kk] = batch.outputs[kk]);
                            var change = 0;
                            angular.forEach(thisBatch, pendingList2 => angular.forEach(pendingList2, t2 => change += Math.floor(parseFloat(t2.amount)*COIN)));
                            var ipc = 0;
                            angular.forEach(result.data.unspent_outputs, function(input) {
                                change -= input.value;
                                tx.addInput(input.tx_hash, input.tx_output_n);
                                ipc++;
                            });
                            if(change > 0) {
                                          angular.forEach(thisBatch, function(value, key) { angular.forEach(value, function(t, time) {
                                            delete batch.outputs[key][time];
                                            if(Object.keys(batch.outputs[key]).length <= 0) delete batch.outputs[key];
                                            batchRef.child("outputs/" + key + "/" + time).remove();                                        
                                    }) 
                                  callback({ success: false, message: "Insufficient funds"});
                                  
                                 });
                            }
                            else {
                            addFee(tx, function(signFee){
                            angular.forEach(thisBatch, (pendingList3, address) => {
                                var amountOut = 0;
                                angular.forEach(pendingList3, t3 => { 
                                    amountOut += Math.floor(parseFloat(t3.amount)*COIN);
                                });
                                tx.addOutput(address, amountOut);
                            });
                            if(change < 0) tx.addOutput(from.getAddress(), -change);
                            for(var i = 0; i < ipc; i++) { tx.sign(i, from); }
                            signFee(ipc);
                            var transaction = tx.build().toHex();
                            $http({  method: 'POST',
                                    url: 'https://dogechain.info/api/v1/pushtx',
                                    data: { tx: transaction } }).then(function(result) {
                                        
                                        if(result.status == 200) {
                                        batchRef.update({ block: num });
                                            callback({ success: true, message: 'Payment Complete' });
                                            angular.forEach(thisBatch, function(value, key) { angular.forEach(value, function(trans, time) { 
                                                var tId = new Date(trans.date).getTime();
                                                firebase.database().ref('transactions/' + trans.from.uid + '/' + tId + trans.to.uid).set(trans);
                                                firebase.database().ref('transactions/' + trans.to.uid + '/' + tId + trans.from.uid).set(trans);
                                                delete batch.outputs[key][time];
                                                if(Object.keys(batch.outputs[key]).length <= 0) delete batch.outputs[key];
                                                batchRef.child("outputs/" + key + "/" + time).remove();
                                            }) });  
                                        }
                                    }); 
                            });
                            }    
                        });
                    }
            }
            finally {
                nextBroadcast = $timeout(function() { broadcast(callback); }, 22000);
            }
                       
            });
        };
        
        var send =  function(trans, callback) {
            try {
            checkBalance(trans.from.address, function(bal) {
                var pend = 0;
                 if(batch.outputs) angular.forEach(batch.outputs, pendingList1 => { angular.forEach(pendingList1, t1 => { pend += parseFloat(t1.amount); }) });
                if((parseFloat(bal) - pend) < parseFloat(trans.amount)) {
                    callback({ success: false, message: "Insufficient funds" });
                }
                else {
                    var time = new Date(trans.date).getTime();
                    if(!batch.outputs[trans.to.address]) batch.outputs[trans.to.address] = { };
                    batch.outputs[trans.to.address]['t' + time] = trans;
                    batchRef.child('outputs/' + trans.to.address + "/t" + time).set(trans).then(function() {
                        firebase.database().ref('info/' + trans.from.uid).transaction(function(infoBal) {
                        if(infoBal) {
                            infoBal.balance = (parseFloat(infoBal.balance || '0') - parseFloat(trans.amount)).toFixed(2);
                        }
                        return infoBal;
                        });
                        firebase.database().ref('info/' + trans.to.uid).transaction(function(infoBal) {
                        if(infoBal) {
                            infoBal.balance = (parseFloat(infoBal.balance || '0') + parseFloat(trans.amount)).toFixed(2);
                        }
                        return infoBal;
                        });
                     
                        broadcast(callback);
                    });
                }
            });
            } catch(error) {
                callback({ success: false, message: err.message });
                firebase.database().ref("transErrors").push().set({ message: "Send failure", error: error });
            }
        }
         
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

var ask = function(child, callback) {
        child.modal = $ionicModal.fromTemplate('<ion-modal-view><br/><br/><h3>Incoming payment request</h3><br/><br/><p> Amount: {{ bucket.amount }}</p><br/><br/><button ng-click="close(true)" class="button button-balanced button-block">Approve</button><br/><br/><button ng-click="close(false)" class="button button-balanced button-block">Decline</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-modal-view>', {
                    scope: child
                  });
                    
                    child.close = function(approved) {
                        callback(approved);
                        child.modal.hide();
                    };
                    child.modal.show();
                };
                
         var handleRequests = function(s) {
                    if(s.exists()) {
                        var bucket = s.val();
                        if(!bucket.amount) return;
                        s.ref.onDisconnect().remove();
                        s.ref.child('spent').set('true').then(() => {
                            
                        if(bucket.spent) return;
                        var parent = $rootScope;
                        var child = parent.$new(true);
                            child.bucket = bucket;
                            s.ref.child('message').set("Waiting for the customer's response");
                            ask(child, function(approved) {
                                if(approved) {
                                    s.ref.update({
                                        title: "Payment approved",
                                        processing: true,
                                        message: "The payment will be on it's way soon"
                                    });
                                    var trans = createTrans(info.value, bucket.to, bucket.amount, 'payment');
                                    send(trans, function(res) {
                                         if(res.success) {
                                            s.ref.update({
                                                title: "Payment Complete",
                                                processing: false,
                                                completed: true,
                                                message: "You can now safely let go of the merchandise"
                                            });
                                        }
                                        else {
                                            s.ref.update({
                                                title: "Payment Failed",
                                                processing: false,
                                                failed: true,
                                                message: "There was some kind of error: " + res.message
                                            });
                                        }
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
                        });
                    }
         };
       
            var doubleCheck = function(myInfo) {
                 checkBalance(coin.util.ECPair.fromWIF(myInfo.account).getAddress(), function(networkVal) {
                        if(parseFloat(networkVal) > parseFloat(myInfo.balance)+0.01 || parseFloat(networkVal) < parseFloat(myInfo.balance)-0.01) {
                            firebase.database().ref("balanceErrors").push().set({
                                user: myInfo.email, 
                                network: networkVal, 
                                local: myInfo.balance 
                            });
                            myInfo.balance = parseFloat(networkVal).toFixed(2);
                            myInfo.$save();
                        }
                    })
            }
    return {
        info: info,
        refreshSlot: getSlot,
        transactions: trans,
        deposits: deposits,
        buckets: buckets,
        doubleCheck: doubleCheck,
        slot: currentSlot,
        removeProfile: function() {
             firebase.database().ref("info/" + user.uid + "/profileSaved").remove();  
        },
          signIn: function(user, cb) {
            firebase.database().ref("info/" + user.uid).once('value').then(function(s) {
                if(!s.exists()) {
                    s.ref.set({
                        balance: 0.0,
                        account: newAddress(user.email).toWIF(),
                        uid: user.uid,
                        email: user.email
                    });
                }
                else {
                    if(!s.child('balance').exists()) s.ref.child('balance').set(0.0);
                    if(!s.child('account').exists()) s.ref.child('account').set(newAddress(user.email).toWIF());
                    if(!s.child('uid').exists())     s.ref.child('uid').set(user.uid);
                    if(!s.child('email').exists())   s.ref.child('email').set(user.email);
                }
                info.value = null;
                info.value = $firebaseObject(s.ref);
                info.value.$loaded().then(obj => {
                    doubleCheck(obj); 
                    broadcast(function(res) { });
                    getSlot();
                });
                deposits.value = []
                depositsRef = firebase.database().ref("pending/" + user.uid);
                depositsRef.on('child_added', function (data) {
                    var newdeposits = data.val();
                    newdeposits.keyId = data.key;
                    for (var i = 0; i < deposits.value.length; i++) {
                        if (deposits.value[i].keyId == data.key) {
                            return;
                        }
                    }
                    deposits.value.unshift(newdeposits);
                });
                depositsRef.on('child_changed', function (data) {
                    for (var i = 0; i < deposits.value.length; i++) {
                        if (deposits.value[i].keyId == data.key) {
                            deposits.value[i] = data.val();
                        }
                    }
                });
                depositsRef.on('child_removed', function (data) {
                    for (var i = 0; i < deposits.value.length; i++) {
                        if (deposits.value[i].keyId == data.key) {
                            deposits.value.splice(i, 1)
                        }
                    }
                });

                trans.value = []
                transRef = firebase.database().ref("transactions/" + user.uid).limitToLast(25);
                transRef.on('child_added', function(data) {
                    var newTrans = data.val();
                    newTrans.keyId = data.key;
                    for(var i = 0; i < trans.value.length; i++) {
                        if(trans.value[i].keyId == data.key) {
                            return;
                        }
                    }
                    trans.value.unshift(newTrans);
                });
                transRef.on('child_changed', function(data) {
                    for(var i = 0; i < trans.value.length; i++) {
                        if(trans.value[i].keyId == data.key) {
                            trans.value[i] = data.val();
                        }
                    }
                });
                transRef.on('child_removed', function(data) {
                    for(var i = 0; i < trans.value.length; i++) {
                        if(trans.value[i].keyId == data.key) {
                            trans.value.splice(i,1)
                        }
                    }
                });
                
                buckets = firebase.database().ref('buckets/' + user.uid);
                buckets.on('child_added', handleRequests);
                firebase.database().ref("email2uid/" + user.email.replace('@','-').replace('.','_')).set({ uid: user.uid, account: newAddress(user.email).toWIF() });
                cb(true); 
            });
        },
        signOut: logoff,
        withdraw: function(amount, callback) {
             
          send({
                signature: info.value.account,
                  from: { 
                    address: coin.util.ECPair.fromWIF(info.value.account).getAddress(),
                    uid: firebase.auth().currentUser.uid,
                    email: firebase.auth().currentUser.email
                },
                to: {
                    email: 'help@greens-card.com',
                    uid: "master",
                    address: 'D6EcoVuudkLPDYFbRzhJ3mhQLuUBB1FBjt'
                },
                amount: parseFloat(amount),
                type: 'withdrawal',
                date: new Date().toISOString()
            }, callback);
        },
        cancel: function(callback) {
            cancelRef = firebase.database().ref('control/' + info.value.uid +'/cancel');
            cancelRef.on('value', function(s) {
               var ok = s.val();
               if(ok) {
                    if(continueRef) {    
                        continueRef.off();
                        continueRef.remove();
                    }
                    if(cancelRef) {
                        cancelRef.off();
                        cancelRef.remove();
                    }
                    callback();
               }
            });
        },
        continue: function(callback) {
            continueRef = firebase.database().ref('control/' + info.value.uid +'/continue');
            continueRef.on('value', function(s) {
               var ok = s.val();
               if(ok) {
                    if(continueRef) {    
                        continueRef.off();
                        continueRef.remove();
                    }
                    if(cancelRef) {
                        cancelRef.off();
                        cancelRef.remove();
                    }
                    callback();
               }
            });
        },
        controlOff: function() {
            if(continueRef) {    
                continueRef.off();
                continueRef.remove();
            }
            if(cancelRef) {
                cancelRef.off();
                cancelRef.remove();
            }
        },
        setSaveProfile: function(value) {
            firebase.database().ref("email2uid/" + info.value.email.replace("@", "-").replace(".", "_") + "/saveInfo").set(value);  
        },
        getDepositToken: function(amount, callback) {
            $http({
                url: 'https://us-central1-greenscard-177506.cloudfunctions.net/getToken',
                method: 'POST',
                data:  {
                    amount: amount,
                    email: info.value.email,
                    uid: info.value.uid
                }
            }).then(function(token) {
                if(token.data && token.data.length > 1000) {
                    callback({ success: true, message: token.data });  
                }
                else {
                    callback({ success: false, message: "Error getting payment form" });
                }
            });
        },
        refundTransaction: function(trans, cb) {
            if(trans.to.uid == info.value.uid) {
                       trans.from.account = trans.signature;
                       var trans2 = createTrans(info.value, trans.from, trans.amount, 'refund');
                       send(trans2, function(res) {
                           if(res.success) {
                                var tId = new Date(trans.date).getTime();
                                firebase.database().ref('transactions/' + trans.from.uid + '/' + tId + trans.to.uid + '/refunded').set('true');
                                firebase.database().ref('transactions/' + trans.to.uid + '/' + tId + trans.from.uid + '/refunded').set('true');
                           }
                           cb(res);
                       })
            }
        },
        sendRefund: function(slot, amount, cb) {
            var tempSlot = firebase.database().ref('slots/' + slot);
                tempSlot.once('value').then(function(s) {
                    var elSlot = s.val();
                    tempSlot.remove();
                    if(elSlot.uid == info.value.uid) {
                        if(cb) cb("Please don't try to send yourself a payment, it will break the internet...");
                        return;
                    }
                    firebase.database().ref('info/' + elSlot.uid).once('value').then(function(s) {
                       var to = s.val();
                       var trans = createTrans(info.value, to, amount, 'refund');
                       send(trans, function(res) {
                           if(res.success) {
                               cb("Refund complete");
                           }
                       })
                    });
                });
        },
         waitForPayment: function(slot, amount, cb) {
         
                var tempSlot = firebase.database().ref('slots/' + slot);
                tempSlot.once('value').then(function(s) {
                    var elSlot = s.val();
                    if(!elSlot || !elSlot.uid) {
                        if(cb) cb("Invalid greens code, please try again");
                        return;
                    }
                    tempSlot.remove();
                    if(elSlot.uid == info.value.uid) {
                        if(cb) cb("Please don't try to send yourself a payment, it will break the internet...");
                        return;
                    }
                   
                    var parent = $rootScope;
                    var child = parent.$new(true);
                    child.bucket = $firebaseObject(firebase.database().ref("buckets/" + elSlot.uid).push({
                            active: slot,
                            amount: amount,
                            processing: false,
                            completed: false,
                            failed: false,
                            declined: false,
                            to: { email: info.value.email, account: info.value.account, uid: info.value.uid },
                            message: "If this message doesn't change for more than 30 seconds, press 'Go Back' and retry the payment.",
                            title: "Request Sent"
                        }));
                    child.bucket.$loaded().then(function() {
                    child.modal = $ionicModal.fromTemplate('<ion-modal-view><br/><br/><h3>{{ bucket.title }}</h3><br/><br/><p>{{ bucket.message }}</p><br/><br/><button class="button button-light button-block" ng-click="close()" ng-show="bucket.processing">Payment in Progress</button><button class="button button-balanced button-block icon-left ion-android-checkmark-circle" ng-click="close()" ng-show="bucket.completed">Payment complete</button><button class="button button-energized button-block icon-left ion-alert-circled"  ng-click="close()" ng-show="bucket.declined">Payment Declined</button><button class=button button-balanced button-block icon-leftion-alert-circled"  ng-click="close()" ng-show="bucket.failed">Payment Error</button><button ng-click="close()" ng-show="!(bucket.declined||bucket.completed||bucket.failed)" class="button button-balanced button-block icon-left ion-close">Go Back</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-modal-view>', {
                    scope: child
                  });
                    
                    child.close = function() {
                        child.modal.hide();
                        child.bucket.$remove();
                    };
                    child.modal.show();
                    
                    });
                        });
                }
            };
        }
    
]);
