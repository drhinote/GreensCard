angular.module('app.controllers', [])
  
.controller('buyCtrl', ['$scope', '$state', '$stateParams', '$http', 'ui', 'dogejs', '$timeout', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $stateParams, $http, ui, dogejs, $timeout) {
     if(!firebase.auth().currentUser) $state.go("login");
    
$scope.output = '';
$scope.info = dogejs.info;
$scope.slot = dogejs.slot;
$scope.addSpaces = num => {
   $scope.qrcode.clear();
   $scope.qrcode.makeCode(num.toString());
   var res = num.toString();
   var i = 3;
   while(i < res.length) {
      res = res.substr(0,i) + ' ' + res.slice(i);
      i += 4;
   }
   return res;
};


// Why wont this page refresh?   HACK
dogejs.buyScope.value = $scope;


$scope.qrcode = new QRCode(document.getElementById("qrcode"), {
	text: $scope.slot.value,
	width: 128,
	height: 128,
});
$scope.qrcode.makeCode($scope.slot.value);
$scope.refresh = dogejs.refreshSlot;
}

])
   
.controller('reloadCtrl', ['$scope', '$state', '$http', '$stateParams', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $http, $stateParams, dogejs) {
        if(!firebase.auth().currentUser) $state.go("login");
    
$scope.output = "Add Payment Information";
$scope.info = dogejs.info;
var feeConfig = dogejs.feeConfig;
$scope.out = { };

$scope.$watch("out.amount", newVal => {
    if(feeConfig.value)
        $scope.fee = parseFloat(((feeConfig.value.depositPercent?parseFloat(newVal)*(parseFloat(feeConfig.value.depositPercent)/100.0):0.0) + (feeConfig.value.depositFlatFee?parseFloat(feeConfig.value.depositFlatFee):0.0)).toFixed(2));
});

// Why wont this page refresh?   HACK
dogejs.reloadScope.value = $scope;

$scope.submit = function() {
    var amount = $scope.out.amount || 0;
    if(amount <= 0.0) {
        $scope.output = "Enter a value, or check your input";
    }
    else if(amount > 500.0) {
        $scope.output = "That's too much";
    }
    else {
        $scope.output = 'Creating Payment Request';
        $state.go("page8", { saveInfo: $scope.out.saveInfo?"yes":"no", amount: $scope.out.amount });
        $scope.output = "Add Payment Information";
    }
}

    var cap = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    var shortDate = function(date) {
        var hour = date.getHours();
        var minute = date.getMinutes();
        if(minute < 10) {
            minute = '0' + minute;
        }
        var part = 'am';
        if(hour > 12) {
            hour -= 12;
            part = 'pm';
        }
        var year = new Date().getFullYear() === date.getFullYear()?'':('/' + date.getYear());
        return (date.getMonth() + 1) + "/" + date.getDate() + year + " at " + hour + ":" + minute + " " + part; // getMonth() is zero-based
    }
    
$scope.prettyPrint = function(deposit) {
    return parseFloat(deposit.amount).toFixed(2) + " on " + shortDate(new Date(deposit.date));
}

$scope.output2 = 'Use Stored Payment Info'
$scope.useStored = function() {
    var amount = parseFloat($scope.out.amount) || 0;
    if(amount <= 0.0) {
        $scope.output2 = "Enter a value";
    }
    else if(amount > 500.0) {
        $scope.output2 = "That's too much";
    }
    else {
        $scope.out.amount = undefined;
        $scope.output2 = 'Creating Payment Request';
        $http({ 
            url: 'https://us-central1-greenscard-177506.cloudfunctions.net/profilePayment',
            method: 'POST',
            data: { profile: dogejs.info.value.profileSaved,
                    amount: amount,
                    uid: dogejs.info.value.uid
            }
        }).then(function(res) {
            $scope.output2 = cap(res.data);
        });
    }
}

$scope.removeProfile = dogejs.removeProfile;

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
    dogejs.setMerchant(false);
    firebase.auth().setPersistence('none');
    firebase.auth().onAuthStateChanged(function(user) {
    if(user) {
        dogejs.signIn(user, function(bal) {
            if(bal > 10) 
                $state.go('home.buy');
            else
                $state.go("home.reload");
        })
    }
    else {
        dogejs.signOut();
        $state.go("login");
    }
    });
    
    var init = function(user, credential, redirectUrl) {
      /*  dogejs.signIn(user, function() {
            if(dogejs.info.balance && parseFloat(dogejs.info.balance) > 10) 
                $state.go('home.buy');
            else
                $state.go("home.reload");
        });
        */
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
        tosUrl: 'https://greens.cards/c/templates/termsOfService.html'
      };
      
      
      ui.start('#firebaseui-auth-container', uiConfig);
}])
   
.controller('manageCtrl', ['$scope', '$stateParams', '$state', '$http', 'dogejs', 
function ($scope, $stateParams, $state, $http, dogejs) {
        if(!firebase.auth().currentUser) $state.go("login");
    
    $scope.info = dogejs.info;
    $scope.transactions = dogejs.transactions;
    dogejs.manageScope.value = $scope;
    
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
    };
    
   $scope.makeNote = function(trans) {
        if(trans.from.uid == dogejs.info.value.uid) 
           return "me -> " + (trans.to.email || "help@greens-card.com");
        else
            return "me <- " + (trans.from.email || "help@greens-card.com");
    };
    
    var cap = function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };
    
    $scope.printPretty = function(trans) {
        return cap(trans.type) + " " + trans.amount.toFixed(2) + " on " + shortDate(new Date(trans.date));
    };
   
   $scope.refreshBalance = dogejs.doubleCheck;
   $scope.logout = function() {  firebase.auth().signOut().then(function() { $state.go("login"); }) };

$scope.refund = function(trans) {
    dogejs.refundTransaction(trans, $scope, function(res) {
        if(res.success) $scope.output = "Transaction refunded";
        else $scope.output = res.message;
    });
};

}
  


])
   
.controller('termsOfServiceCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
   
.controller('page8Ctrl', ['$scope', '$stateParams', '$state', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams, $state, dogejs) {
    $scope.goBack = function() {
        dogejs.controlOff();
        $state.go('home.reload');
    }
    dogejs.cancel(function() {
        $state.go('home.reload');
    });
    dogejs.continue(function() {
        $state.go('home.buy');
    });
    
    var shell = document.getElementById('shell');
    shell.innerHTML = '<br/>&nbsp;&nbsp;Loading payment form';
        dogejs.getDepositToken($stateParams.amount, function(res) {
            if(res.success) {
                dogejs.setSaveProfile($stateParams.saveInfo)
                 loadForm(res.message);
            }
            else {
                $scope.output = "Error, try again";
            }
        });
        var frameId;
        var loadForm = function(token) {
            frameId = 'd' + Math.floor(Math.random() * 99999);
            var w = window.innerWidth;
            var h = window.innerHeight;
            shell.innerHTML = '<iframe id="' + frameId + '" height="' + h + '" width="' + w + '" name="' + frameId +
            '"></iframe><form name="loader" id="loader" method="post" action="https://test.authorize.net/payment/payment" target="' + frameId + 
            '"><input type="hidden" name="token" value="' + token + '"></input></form>';
            var loader = document.getElementById('loader');
            if(loader) loader.submit();
        }
}])
   
.controller('pageCtrl', ['$scope', '$stateParams', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $stateParams) {


}])
 