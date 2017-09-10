angular.module('app.routes', [])

.config(function($stateProvider, $urlRouterProvider) {

  // Ionic uses AngularUI Router which uses the concept of states
  // Learn more here: https://github.com/angular-ui/ui-router
  // Set up the various states which the app can be in.
  // Each state's controller can be found in controllers.js
  $stateProvider
    

      .state('home.withdraw', {
    url: '/withdraw',
    views: {
      'tab1': {
        templateUrl: 'templates/withdraw.html',
        controller: 'withdrawCtrl'
      }
    }
  })

  .state('home', {
    url: '/home',
    templateUrl: 'templates/home.html',
    abstract:true
  })

  .state('login', {
    url: '/login',
    templateUrl: 'templates/login.html',
    controller: 'loginCtrl'
  })

  .state('home.capture', {
    url: '/capture',
    views: {
      'tab3': {
        templateUrl: 'templates/capture.html',
        controller: 'captureCtrl'
      }
    }
  })

  .state('home.manage', {
    url: '/manage',
    views: {
      'tab4': {
        templateUrl: 'templates/manage.html',
        controller: 'manageCtrl'
      }
    }
  })

$urlRouterProvider.otherwise('/home/manage')


});