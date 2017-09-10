angular.module('firebaseConfig', ['firebase'])
.run(function($state){

  // Initialize Firebase
  var config = {
    apiKey: "AIzaSyCo2mPfQprhoNadSMNH0E8J-Z8H-b4MNi0",
    authDomain: "greenscard-177506.firebaseapp.com",
    databaseURL: "https://greenscard-177506.firebaseio.com",
    storageBucket: "greenscard-177506.appspot.com",
  };
  firebase.initializeApp(config);
  
}).service("ui", [ function(){
    var ui
    try {
        ui = new firebaseui.auth.AuthUI(firebase.auth());
    } catch(e) {
        ui = firebaseui.auth.AuthUI.getInstance();
    }
    return ui;
}])