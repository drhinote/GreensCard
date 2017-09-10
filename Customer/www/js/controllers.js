angular.module('app.controllers', [])
  
.controller('buyCtrl', ['$scope', '$state', '$stateParams', '$http', 'ui', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $stateParams, $http, ui, dogejs) {
 
$scope.output = ''
$scope.info = dogejs.info;

$scope.qrcode = new QRCode(document.getElementById("qrcode"), {
	text: "https://Greens.Card/",
	width: 256,
	height: 256,
	colorDark : "#000000",
	colorLight : "#ffffff",
	correctLevel : QRCode.CorrectLevel.H
});

$scope.refresh = dogejs.refreshSlot;

$scope.refresh(function(id) {
            $scope.qrcode.clear();
            $scope.qrcode.makeCode("https://Greens.Card/capture?code=" + id);
    });
}

])
   
.controller('reloadCtrl', ['$scope', '$state', '$http', '$stateParams', 'dogejs', // The following is the constructor function for this page's controller. See https://docs.angularjs.org/guide/controller
// You can include any angular dependencies as parameters for this function
// TIP: Access Route Parameters for your page via $stateParams.parameterName
function ($scope, $state, $http, $stateParams, dogejs) {
$scope.output = "Reload";
$scope.out = {}

$scope.info = dogejs.info;
$scope.submit = function() {
    var amount = $scope.out.amount;
    if(amount <= 0.0) {
        $scope.output = "That's not enough"
    }
    else if(amount > 500.0) {
        $scope.output = "That's too much"
    }
    else {
        $scope.out.amount = undefined;
        $scope.output = 'Reloading...';
        dogejs.deposit(amount, function(res) {
            if(res.success) {
                $scope.output = "Reload";
                $state.go("home.buy_tab1");   
            }
            else {
                $scope.output = res.message;
            }
        })
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
            $state.go("home.reload");
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
   
.controller('manageCtrl', ['$scope', '$stateParams', '$state', '$http', 'dogejs', 
function ($scope, $stateParams, $state, $http, dogejs) {

    $scope.info = dogejs.info;
    $scope.transactions = dogejs.transactions;
    
    var shortDate = function(date) {
        var tz = new Date().getTimezoneOffset();
        var hour = date.getHours();
        var minute = date.getMinutes();
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
 