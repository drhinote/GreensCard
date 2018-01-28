angular.module('app.services', ['ionic.cloud', 'ionic.cloud.init', 'firebase', 'ngWebSocket'])
  .factory('dogejs', ["$http", "$firebaseObject", "$firebaseArray", "$rootScope", "$ionicModal", "$state", "$timeout", function ($http, $firebaseObject, $firebaseArray, $rootScope, $ionicModal, $state, $timeout) {
    var feeWallet = { uid: "profit", address: "DJi1eo9Hv5nJH9fJK8YydCmsrfTemBfM6m", account: "6KDKt1GJiath11Y8cWsQom78fkHjUWis73492y4XeAAYdi8wAvf", email: "help@greens-card.com" };
    var withdrawalFeeWallet = { uid: "withdrawal", address: "DCLPBm6kND8ZWwyn4WYYpGbbxfk5DHZouG", account: "6JQ2M6noanNM7xw8Ayu8ewxWmLiPdNVTgK4roicQx4HeA81zT1U", email: "help@greens-card.com" };
    var wallet;
    var tipWallet;
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

    var websocket;
    var transactions;
    var bucketsRef;
    var slotRef;
    var profileRef;

    var logoff = function () {
      settled = 0;
      wallet = undefined;
      tipWallet = undefined;
      tips = 0;
      transactions.$destroy();
      slot.value = '';
      if (websocket) websocket.close();
      if (slotRef) slotRef.off();
      if (bucketsRef) bucketsRef.off();
      if (profileRef) profileRef.off();
    };

    var newAddress = function (email, callback) {
      $http({
        url: 'https://us-central1-greenscard-177506.cloudfunctions.net/getAccount',
        method: 'POST',
        data: email,
      }).then(function (token) {
        if (token.data) {
          wallet = coin.util.ECPair.fromWIF(token.data);
          callback({ success: true, message: token.data });
        }
        else {
          callback({ success: false, message: "Error getting account" });
        }
      });
    };

    var newTipAddress = function (email, callback) {
      $http({
        url: 'https://us-central1-greenscard-177506.cloudfunctions.net/getTipAccount',
        method: 'POST',
        data: email,
      }).then(function (token) {
        if (token.data) {
          tipWallet = coin.util.ECPair.fromWIF(token.data);
          callback({ success: true, message: token.data });
        }
        else {
          callback({ success: false, message: "Error getting account" });
        }
      });
    };

    var getSettledBalance = (callback) => {
      $http({ url: 'https://dogechain.info/api/v1/unspent/' + wallet.getAddress() }).then(function (result) {
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
          $http({ url: 'https://api.blockcypher.com/v1/doge/main/addrs/' + tipWallet.getAddress() + '?unspentOnly=true&includeConfidence=false&includeScript=false' }).then(function (result2) {
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

    var checkBalance = () => {
      var pending = 0;
      var tipsPending = 0;

      transactions.forEach(trans => {
        if (trans.batched === "false") {
          var isMine = trans.from.uid == info.value.uid;
          pending += isMine ? trans.amount : -trans.amount;
          if (isMerchant) {
            tipsPending += isMine ? trans.amount : -trans.amount;
          }
        }
      });
      info.value.balance = settled - pending;
      info.value.tipsBal = tips - tipsPending;
      if (reloadScope.value) {
        reloadScope.value.$apply();
      }
      if (buyScope.value) {
        buyScope.value.$apply();
      }
      if (manageScope.value) {
        manageScope.value.$apply();
      }
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
          address: wallet.getAddress(),
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
      firebase.database().ref("transactions/" + (Number.MAX_SAFE_INTEGER - new Date(trans.date).getTime())).set(trans);
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
        bucket.tip = parseFloat(amount.toFixed(2));
      };
      child.modal = $ionicModal.fromTemplate('<ion-modal-view padding="true" class="manual-ios-statusbar-padding"><br/><br/><h3>Incoming payment request</h3><br/><br/>Amount: {{ bucket.amount.toFixed(2) }}<br/>' +
        '<div ng-show="bucket.fee && (bucket.fee > 0)">Processing fee: {{ bucket.fee }}<br/></div>' +
        '<div ng-show="bucket.tipsEnabled">Show your appreciation<div class="button-bar">' +
        '<button ng-click="setTip(bucket.pct5)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct5.toFixed(2) }}</button>' +
        '<button ng-click="setTip(bucket.pct10)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct10.toFixed(2) }}</button>' +
        '<button ng-click="setTip(bucket.pct15)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct15.toFixed(2) }}</button>' +
        '<button ng-click="setTip(bucket.pct20)" style="font-size:12px;" class="button button-balanced button-block button-outline">{{ bucket.pct20.toFixed(2) }}</button>' +
        '</div>' +
        '<form class="list">' +
        '<label class="item item-input">' +
        '<span class="input-label">Tip</span>' +
        '<input type="number" placeholder="" step="0.01" ng-pattern="/^[0-9]+(\.[0-9]{1,2})?$/" ng-model="bucket.tip">' +
        '</label>' +
        '</form></div>' +
        '<br/><button ng-click="close(true)" class="button button-balanced button-block">Approve</button><br/><br/><button ng-click="close(false)" class="button button-balanced button-block">Decline</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-modal-view>', {
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

                var trans = blindTrans(info.value, bucket.to, bucket.amount, 'payment', (bucket.tip > 0 && bucket.tip + bucket.amount + fee <= bal) ? bucket.tip : 0, { transactionFee: fee }, bucket.to.uid, info.value.uid);
                send(trans, function (res) {
                  if (res.success) {
                    s.ref.update({
                      title: "Payment Complete",
                      processing: false,
                      completed: true,
                      message: "Thank you for using our service" + (rand > 98.0 ? ", I'm getting a little verklempt!" : "")
                    });
                    if (fee > 0) {
                      var feeTrans = blindTrans(info.value, feeWallet, fee, 'fee', 0, { transaction: trans }, "transactionFee", info.value.uid);
                      send(feeTrans, function (res2) { });
                    }
                    if (bucket.tip > 0 && bucket.tip + bucket.amount <= bal) {
                      var tipTrans = blindTrans(info.value, bucket.tipTo, bucket.tip, 'tip', 0, { transaaction: trans }, "tip" + bucket.to.uid, info.value.uid);
                      send(tipTrans, function (res3) { });
                    }
                  } else {
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
    var timer;
    var defaultConfig = {};
    var allTrans = {};


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
      transactions: allTrans,
      reloadScope: reloadScope,
      manageScope: manageScope,
      buyScope: buyScope,
      setTips: isEnabled => {
        tipping = isEnabled;
        firebase.database().ref('info/' + info.value.uid + '/tipping').set(isEnabled);
      },
      getTips: callback => {
        if (!tipping) {
          firebase.database().ref('info/' + info.value.uid + '/tipping').once('value').then(s => {
            if (!s.exists()) {
              s.ref.set(false);
              tipping = false;
              callback(false);
            } else {
              tipping = s.val();
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
        newAddress(user.email, account => {
          wallet = coin.ECPair.fromWIF(account);
          newTipAddress(user.email, tipAccount => {
            tipWallet = coin.ECPair.fromWIF(tipAccount);
            websocket = new WebSocket("wss://socket.blockcypher.com/v1/doge/main");
            websocket.onmessage = function (event) {
              var tx = JSON.parse(event.data);
              var addrrs = tx.addresses.join(",");
              if (addrrs.includes(wallet.getAddress()) || addrrs.includes(tipWallet.getAddress())) {
                getSettledBalance(bal => {
                  checkBalance();
                });
              }
            }
            ws.onopen = function (event) {
              ws.send(JSON.stringify({ event: "unconfirmed-tx" }));
            }
          });
        });

        defaultConfig.value = $firebaseObject(firebase.database().ref('merchants/000default'));
        defaultConfig.value.$loaded().then(() => {
          getSettledBalance(bal => {
            info.value.balance = bal;
            info.value.tipsBal = tips;
            info.value.uid = user.uid;
            info.value.email = user.email;

            getSlot();
            firebase.database().ref('info/' + user.uid).update(info.value);

            profileRef = firebase.database().ref("info/" + user.uid + "/profileSaved");
            profileRef.on('value', s => {
              if (s.exists()) {
                info.value.profileSaved = s.val();
                if (reloadScope.value) {
                  try {
                    reloadScope.value.$apply();
                  } catch (err) {
                    console.log(err);
                  }
                }
              }
              else {
                info.value.profileSaved = null;
              }
            });

            allTrans.value = transactions = $firebaseArray(firebase.database().ref("transactions").orderByChild(isMerchant ? "merchant" : "customer").equalTo(user.uid).limitToLast(100));
            transactions.$loaded().then(() => {
              var bal = checkBalance();
              transactions.$watch(checkBalance);
              bucketsRef = firebase.database().ref('buckets/' + user.uid);
              bucketsRef.on('child_added', handleRequests);
              firebase.database().ref("email2uid/" + user.email.replace(new RegExp('@', 'g'), '-').replace(new RegExp('\\.', 'g'), '_')).set({ uid: user.uid, account: newAddress(user.email).toWIF() });
              cb(bal);
            });
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
        send(withdrawalTrans, res => {
          if (res.success) {
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
              var feeTrans1 = blindTrans(info.value, feeWallet, parseFloat(fee), 'fee', 0, { trans: withdrawalTrans }, info.value.uid, "master");
              send(feeTrans1, function (res2) { });
            }
            if (flatFee > 0) {
              var feeTrans2 = blindTrans(info.value, withdrawalFeeWallet, parseFloat(flatFee), 'fee', 0, { trans: withdrawalTrans }, info.value.uid, "withdrawalFee");
              send(feeTrans2, function (res3) { });
            }
            callback({ success: true, message: "Withdrawal successful" });
          } else {
            callback(res);
          }
        });
      },
      withdrawTips: function (amount, callback) {
        var tipSig = tipWallet;
        var to = {
          email: 'help@greens-card.com',
          uid: "master",
          address: 'D6EcoVuudkLPDYFbRzhJ3mhQLuUBB1FBjt'
        };
        var withdrawalTrans = blindTrans({ email: info.value.email, uid: info.value.uid, account: tipSig.toWIF(), address: tipSig.getAddress() }, to, parseFloat(amount), "withdrawalTips", 0, {
          withdrawalFlatFee: flatFee || 0,
          withdrawalFee: fee || 0
        }, 'tip' + info.value.uid, "master");
        send(withdrawalTrans, res => {
          if (res.success) {
            firebase.database().ref("withdrawals").push({
              email: info.value.email,
              uid: info.value.uid,
              amount: amount,
              date: new Date().toISOString(),
              fee: 0,
              flatFee: 0,
              date: new Date().toISOString(),
              trans: withdrawalTrans,
              isTipWithdraw: true
            });
            callback({ success: true, message: "Withdrawal successful" });
          } else {
            callback(res);
          }
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
                var feeTrans = blindTrans(feeWallet, trans.from, fee, 'fee', 0, { transaction: trans2 }, "master", trans.from.uid);
                send(feeTrans, function (res2) { });
              }
              if (trans.tip > 0) {
                var tipTrans = blindTrans({ email: info.value.email, address: tipWallet.getAddress(), account: tipWallet.toWIF(), uid: "tip" + info.value.uid }, trans.from, trans.tip, 'tip Refund', 0, { transaction: trans2 }, "tip" + info.value.uid, trans.from.uid);
                send(tipTrans, function (res3) { });
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
            if (cb) cb("Please don't try to send yourself a payment, it will break the internet...");
            return;
          }

          var parent = $rootScope;
          var child = parent.$new(true);
          firebase.database().ref('info/' + info.value.uid + '/tipping').once('value').then(s => {
            firebase.database().ref('merchants/' + info.value.uid).once('value').then(t => {
              var tipsEnabled = s.val();
              var feeConfig = t.val();
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
                to: { email: info.value.email, address: wallet.getAddress(), uid: info.value.uid },
                tipTo: { email: info.value.email, address: tipWallet.getAddress(), uid: "tip" + info.value.uid },
                tipsEnabled: tipsEnabled,
                message: "If this message doesn't change for more than 30 seconds, press 'Go Back' and retry the payment.",
                title: "Request Sent"
              }));

              child.bucket.$loaded().then(function () {
                child.modal = $ionicModal.fromTemplate('<ion-modal-view><br/><br/><h3>{{ bucket.title }}</h3><br/><br/><p>{{ bucket.message }}</p><br/><br/><button class="button button-light button-block" ng-click="close()" ng-show="bucket.processing">Payment in Progress</button><button class="button button-balanced button-block icon-left ion-android-checkmark-circle" ng-click="close()" ng-show="bucket.completed">Payment complete</button><button class="button button-energized button-block icon-left ion-alert-circled"  ng-click="close()" ng-show="bucket.declined">Payment Declined</button><button class=button button-balanced button-block icon-leftion-alert-circled"  ng-click="close()" ng-show="bucket.failed">Payment Error</button><button ng-click="close()" ng-show="!(bucket.declined||bucket.completed||bucket.failed)" class="button button-balanced button-block icon-left ion-close">Go Back</button><div ng-show="false" id="firebaseui-auth-container"></div></ion-modal-view>', {
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
        });
      }
    };
  }

  ]);
