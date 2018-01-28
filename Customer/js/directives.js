angular.module('app.directives', ['ionic.cloud','ionic.cloud.init'])
.directive("ngScopeElement", function () {
  return {
    restrict: "A",
    compile: function compile(tElement, tAttrs, transclude) {
      return {
          pre: function preLink(scope, iElement, iAttrs, controller) {
            scope[iAttrs.ngScopeElement] = iElement;
          }
        };
    }
  };
})
.directive('qrcode', [function() {
    return {
        template: '<div align="center"><br><div ng-scope-element="list" align="center"></div><br></div>',
        link: function(scope) {
                scope.qrcode = new QRCode(scope.list[0], {
                    text: scope.slot.value,
                    height: 128,
                    width: 128
                });
      }  
    };
}]);