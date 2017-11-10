angular.module('app.controllers', [])
  
.controller('withdrawCtrl', ['$scope', '$state', '$http', '$stateParams', 'dogejs', '$timeout', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $http, $stateParams, dogejs, $timeout) {
if(!firebase.auth().currentUser) $state.go("login"); 
$scope.out = { };
$scope.out.output = "Withdraw";
$scope.out.tipOutput = "Withdraw Gratuities";
$scope.info = dogejs.info;

var feeConfig;
dogejs.getWithdrawConfig(c => feeConfig = c);
var flatFee = 0;
var feeFee = 0;
$scope.$watch("out.amount", newVal => {
    if(feeConfig) {
        flatFee = parseFloat((feeConfig.withdrawalFlatFee ? parseFloat(feeConfig.withdrawalFlatFee) : 0.0).toFixed(2));
   //     feeFee = parseFloat((feeConfig.withdrawalPercent ? parseFloat($scope.out.amount) - (parseFloat($scope.out.amount) / ((parseFloat(feeConfig.withdrawalPercent) / 100.0) + 1)) : 0.0).toFixed(2));
        feeFee = parseFloat((feeConfig.withdrawalPercent ?  parseFloat($scope.out.amount) * parseFloat(feeConfig.withdrawalPercent) / 100.0 : 0.0).toFixed(2));
        $scope.fee = $scope.out.amount? (feeFee + flatFee).toFixed(2) : null;
    }
});

$scope.submit = function() {
    var amount = parseFloat($scope.out.amount);
    if(amount > 0 && amount <= parseFloat($scope.info.value.balance)) {
            $scope.out.output = 'Withdrawing...';
            dogejs.withdraw(amount, flatFee, feeFee, function(res) {
            if(res.success) {
                $scope.out.amount = undefined;
                $scope.out.output = 'Withdraw Successful';
            }
            else
            {
                $scope.out.amount = undefined;
                $scope.out.output = 'Withdrawal delayed, check back later';
            }
            $timeout(function() {
                    $scope.out.output = 'Withdraw';
            }, 3000);
        });
    }
    else {
        $scope.out.output = 'Check requested amount';
         $timeout(function() {
                    $scope.out.output = 'Withdraw';
            }, 3000);
    }
};

$scope.submitTips = function() {
    var amount = parseFloat($scope.out.tipAmount);
    if(amount > 0 && amount <= parseFloat($scope.info.value.tipsBal)) {
            $scope.out.tipOutput = 'Withdrawing...';
            dogejs.withdrawTips(amount, function(res) {
            if(res.success) {
                $scope.out.tipAmount = undefined;
                $scope.out.tipOutput = 'Withdraw Successful';
            }
            else
            {
                $scope.out.tipAmount = undefined;
                $scope.out.tipOutput = 'Withdrawal delayed, check back later';
            }
            $timeout(function() {
                    $scope.out.tipOutput = 'Withdraw Gratuities';
            }, 3000);
        });
    }
    else {
        $scope.out.tipOutput = 'Check requested amount';
         $timeout(function() {
                    $scope.out.tipOutput = 'Withdraw Gratuities';
            }, 3000);
    }
};
}])
      
.controller('loginCtrl', ['$scope', '$stateParams', '$state', 'ui', 'dogejs', 
function ($scope, $stateParams, $state, ui, dogejs) {
    dogejs.setMerchant(true);
    firebase.auth().onAuthStateChanged(function(user) {
    if(user) {
        firebase.database().ref('merchants/' + user.uid + '/approved').once('value').then(function(s) {
        var approved = s.val();    
            dogejs.signIn(user, function(bal) {
                if(approved) {
                    $state.go("home.manage");
                } else {
                    var mRef = firebase.database().ref('merchants/' + user.uid);
                    mRef.set({
                       email: user.email,
                       uid: user.uid,
                       approved: false
                    });
                       var shell = document.getElementById('firebaseui-auth-container');
                shell.innerHTML = '<br/>&nbsp;&nbsp;Merchant account request has been submitted and is under review.   You will be contacted by one of our staff to complete the application process.';
                    mRef.on('value', s => {
                        if(s.exists() && s.child('approved').val()) {
                              $state.go("home.manage");
                        } 
                    });
                }
            });
        });
    }
    else {
        dogejs.signOut();
        $state.go("login");
    }
    });
    
    var init = function(currentUser, credential, redirectUrl) {
            return false;
     };
          
    var uiConfig = {
        signInFlow: 'redirect',
        callbacks: {
            signInSuccess: init
        },  
        credentialHelper: firebaseui.auth.CredentialHelper.NONE,
        signInOptions: [
          firebase.auth.EmailAuthProvider.PROVIDER_ID,
       //   firebase.auth.GoogleAuthProvider.PROVIDER_ID,
    //      firebase.auth.FacebookAuthProvider.PROVIDER_ID
        ],
        tosUrl: 'https://greens.cards/templates/termsOfService.html'
      };
      
      
      ui.start('#firebaseui-auth-container', uiConfig);
}])
   
.controller('captureCtrl', ['$scope', '$state', '$stateParams', '$http', '$location', 'dogejs', '$timeout', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $stateParams, $http, $location, dogejs, $timeout) {

    if(!firebase.auth().currentUser) $state.go("login");
    
   $scope.output = "";
   $scope.out = {};
   $scope.out.refund = false;
   var once = 3
   var dash = function(tstr) {
        if(!tstr.includes('-') && tstr.length == 6) {
            return tstr.substr(0,3) + '-' + tstr.slice(3);
        }
    };
   $scope.manualRequest = function(text) {
      if(!$scope.out.amount) {
            $scope.output = "Amount must be in between 0 and 500";
        } else if(!text) {
            $scope.output = "Missing Greens Code";
        }
        else
        {
            $scope.output = "";
            var amount = $scope.out.amount;
            var refund = $scope.out.refund;
            $scope.out.slot = undefined;
            $scope.out.amount = undefined;
            $scope.out.refund = false;
            
            if(refund)
            {
                dogejs.sendRefund(text, amount, function(txt) {
                    $scope.output = txt;
                 });
            }
            else 
            {
                dogejs.waitForPayment(text, amount, function(txt) {
                    $scope.$apply($scope.output = txt);
                });
            }
        }
   };
   
    var last = '';
    
    var scann = function (err, text) {
            if(!err && last != text) {
                
            
                    last = text;
                    scanning = false;
                    QRScanner.hide();
                    $scope.manualRequest(text);
            }
            else {
                console.log("Code scanned twice or error: " + JSON.stringify(err));
            }
          
    };
       try {
      var scanning = false;
    window.QRScanner_SCAN_INTERVAL = 600;
    
        QRScanner.scan(scann);
    $scope.$watch("out.amount", val => {
           if(scanning === false && val) {
                scanning = true;
                QRScanner.show();
            }
  
    });
       } catch(e) {
           $scope.output = "Scanner disabled";
        }
}])
   
.controller('manageCtrl', ['$scope', '$stateParams', '$state', '$http', 'dogejs', '$timeout', 
function ($scope, $stateParams, $state, $http, dogejs, $timeout) {
    if(!firebase.auth().currentUser) $state.go("login");
    
    dogejs.manageScope.value = $scope;
  
    dogejs.getTips(val => $scope.tipping = val);
    
    $scope.setTips = dogejs.setTips;
    
    $scope.info = dogejs.info;
    $scope.transactions = dogejs.transactions;
    
    var shortDate = function(date) {
        var hour = date.getHours();
        var minute = date.getMinutes();
        if(minute < 10) {
            minute = '0' + minute;
        }
        var part = 'am';
        if(hour > 11) {
            part = 'pm';
        }
        if(hour > 12) {
            hour -= 12;
        }
        var year = new Date().getFullYear() === date.getFullYear()?'':('/' + date.getYear());
        return (date.getMonth() + 1) + "/" + date.getDate() + year + " at " + hour + ":" + minute + " " + part; // getMonth() is zero-based
    }
    
   
    var cap = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    $scope.printPretty = function(trans) {
        if(trans.processingRefund) trans.note = "Refund in progress";
        if(trans.from.uid == dogejs.info.value.uid) 
           trans.note = "me -> " + (trans.to.email || "help@greens-card.com") 
        else
            trans.note = "me <- " + (trans.from.email || "help@greens-card.com") 
        return cap(trans.type) + " " + trans.amount.toFixed(2) + (trans.tip>0?"+"+trans.tip.toFixed(2):"") + " on " + shortDate(new Date(trans.date));
    }
   
   $scope.logout = function() {  firebase.auth().signOut().then(function() { $state.go("login"); }) };
$scope.refreshBalance = dogejs.doubleCheck;
$scope.refund = function(trans) {
    trans.processingRefund = true;
    trans.note = "Processing Refund"
    $timeout(() => {
    dogejs.refundTransaction(trans, function(res) {
        delete trans.processingRefund;
        if(res.success) {
            trans.note ="Transaction refunded";
            trans.refunded = true;
        }
        else {
            trans.note = "Refund failed";
        }
        } )
        
    });
}

    

}
  


])
   
.controller('termsOfServiceCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
 