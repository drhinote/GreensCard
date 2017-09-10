angular.module('app.controllers', [])
  
.controller('withdrawCtrl', ['$scope', '$state', '$http', '$stateParams', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $http, $stateParams, dogejs) {
if(!firebase.auth().currentUser) $state.go("login"); 
$scope.out = { }
$scope.output = "Withdraw";
$scope.info = dogejs.info;

$scope.submit = function() {
    var amount = $scope.out.amount;
    if(amount > 0 && amount <= dogejs.info.value.balance + 0.01) {
        $scope.out.amount = undefined
            $scope.output = 'Withdrawing...'
        dogejs.withdraw(amount, function(res) {
            if(res.success) {
                $scope.output = 'Withdraw'
                $state.go('home.manage_tab1');
            }
            else
            {
                $scope.output = 'Withdrawal failed'
            }
        })
    }
    else {
        $scope.output = 'Check requested amount';
    }
}

}])
      
.controller('loginCtrl', ['$scope', '$stateParams', '$state', 'ui', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName

//username	unique username
//email	unique email address
//password	write-only password
//name	first and last name
//image	url to identifying image

function ($scope, $stateParams, $state, ui, dogejs) {
    
    firebase.auth().onAuthStateChanged(function(user) {
    if(user) {
        dogejs.signIn(user, function() {
            $state.go("home.manage");
        })
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
        tosUrl: 'https://greens.cards/terms.html'
      };
      
      
      ui.start('#firebaseui-auth-container', uiConfig);
}])
   
.controller('captureCtrl', ['$scope', '$state', '$stateParams', '$http', '$location', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $stateParams, $http, $location, dogejs) {

    if(!firebase.auth().currentUser) $state.go("login");
    
   $scope.output = "";
   $scope.out = {};
   $scope.out.refund = false;
   var once = 3
    $scope.dash = function() {
        if(!$scope.out.slot.includes('-') && $scope.out.slot.length >= once) {
            once = 4;
            var tstr = $scope.out.slot;
            $scope.out.slot = tstr.substring(0,3) + '-';
            if(tstr.length > 3) {
                $scope.out.slot += tstr.slice(3);
            }
        }
        if($scope.out.slot.length < 4) {
            once = 3;
        }
    }
   $scope.manualRequest = function() {
         if(($scope.out.amount || 0) <= 0 || ($scope.out.amount || 0) > 500) {
            $scope.output = "Amount must be in between $0 and $500";
         }
         else if(!$scope.out.slot) {
            $scope.output = "Missing Greens Code";
        }
        else
        {
            var amount = $scope.out.amount;
            var refund = $scope.out.refund;
            var slot = $scope.out.slot;
            $scope.out.amount = undefined
            $scope.out.refund = false
            $scope.out.slot = undefined
            
            if(refund)
            {
                dogejs.sendRefund(slot, amount, $scope);
            }
            else 
            {
                dogejs.waitForPayment(slot, amount, function(txt) {
                    $scope.output = txt;
                });
            }
        }
   };
   
    var checkInput = function(text) {
       if((typeof text == "string") && (text || '').contains("?code=")) {
            $scope.out.envelope = text.replace(/.*\?code=/,"");
            $scope.manualRequest();
        }
   }
   
    if($location.search) {
        checkInput($location.search);
    }
   
   try {
        QRScanner.scan(function (err, text){
          if(!err) {
              checkInput(text);
          }
        });
        QRScanner.show();
   } catch(e) {
       console.log(e);
       $scope.output = "Scanner disabled";
   }
}])
   
.controller('manageCtrl', ['$scope', '$stateParams', '$state', '$http', 'dogejs', 
function ($scope, $stateParams, $state, $http, dogejs) {
    if(!firebase.auth().currentUser) $state.go("login");
  
    $scope.info = dogejs.info;
    $scope.transactions = dogejs.transactions;
    
    var shortDate = function(date) {
        var tz = new Date().getTimezoneOffset();
        var hour = (date.getHours() + 1);
        var minute = date.getMinutes() + 1;
        var part = 'am';
        if(hour > 12) {
            hour -= 12;
            part = 'pm';
        }
        var year = new Date().getFullYear() === date.getFullYear()?'':('/' + date.getYear());
        return (date.getMonth() + 1) + "/" + date.getDate() + year + " at " + hour + ":" + minute + " " + part; // getMonth() is zero-based
    }
    
    $scope.makeNote = function(trans) {
        if(trans.from.uid == dogejs.info.value.uid) 
           return "me -> " + (trans.to.email || "tgc") 
        else
            return "me <- " + (trans.from.email || "tgc") 
    }
    
    var cap = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    $scope.printPretty = function(trans) {
        return cap(trans.type) + " " + trans.amount.toFixed(2) + " on " + shortDate(new Date(trans.date));
    }
   
   $scope.logout = function() {  firebase.auth().signOut().then(function() { $state.go("login"); }) };

$scope.refund = function(trans) {
    dogejs.refundTransaction(trans, $scope, function(res) {
        if(res.success) $scope.output = "Transaction refunded";
        else $scope.output = res.message;
    })
}

}
  


])
 