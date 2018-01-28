(function () {
    'use strict';
    angular
        .module('app', ["firebase", "ngMaterial"])
        .controller('controller', ['$scope', '$firebaseObject', ($scope, $firebaseObject) => {

            firebase.auth().setPersistence('none');
            firebase.auth().onAuthStateChanged(function (user) {
                if (user) {
                    $scope.info = $firebaseObject(firebase.database().ref('info').child(firebase.auth().currentUser.uid));
                    $scope.email = firebase.auth().currentUser.email;
                    firebase.database().ref("transactions").orderByChild("merchant").equalTo(firebase.auth().currentUser.uid).once('value').then(s => {
                        s.forEach(cs => {
                            addTrans(cs.key, cs.val());
                        });
                    });
                }
                else {
                    $scope.info = undefined;

                    $scope.reportType = 'day';
                    $scope.ranges = {};
                }
            });

            var init = function (user, credential, redirectUrl) {
                return false;
            };

            function activate() {
                var ui;
                try {
                    ui = new firebaseui.auth.AuthUI(firebase.auth());
                } catch (e) {
                    ui = firebaseui.auth.AuthUI.getInstance();
                }
                var uiConfig = {
                    callbacks: {
                        signInSuccess: init
                    },
                    credentialHelper: firebaseui.auth.CredentialHelper.NONE,
                    signInOptions: [
                        firebase.auth.EmailAuthProvider.PROVIDER_ID
                    ],
                    tosUrl: 'https://greens.cards/termsOfService.html'
                };


                ui.start('#firebaseui-auth-container', uiConfig);

            }

            activate();
            
            $scope.$watch("reportType", (newVal, oldVal) => {
                if(newVal != oldVal) $scope.transactions = undefined;
            });

            var display = range => {
                $scope.out = range;
            };
            
            $scope.reportType = 'day';
            $scope.ranges = {};

            var now = new Date();
            var year = now.getFullYear();
            var month = now.getMonth();
            var day = now.getDate();
            var oneDay = 1000 * 60 * 60 * 24;

            var today = new Date(year, month, day).getTime();
            var weekToDate = today - (oneDay * now.getDay());
            var monthToDate = new Date(year, month).getTime();
            var yearToDate = new Date(year, 0);

            var yesterday = today - oneDay;
            var lastWeek = weekToDate - (7 * oneDay);
            var lastMonth = new Date(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
            var lastYear = new Date(year - 1, 0);

            var includedRanges = time => {
                var ranges = [];
                if (time >= today) ranges.push('day');
                if (time >= weekToDate) ranges.push('week');
                if (time >= monthToDate) ranges.push('month');
                if (time >= yearToDate) ranges.push('year');
                if (time >= yesterday && time < today) ranges.push('yesterday');
                if (time >= lastWeek && time < weekToDate) ranges.push('yesterweek');
                if (time >= lastMonth && time < monthToDate) ranges.push('yestermonth');
                if (time >= lastYear && time < yearToDate) ranges.push('yesteryear');
                return ranges;
            };

            var cleanAmount = trans => {
                trans.amount = parseFloat(trans.amount.toFixed(2));
            };

            var baseCalc = (trans, range, vector) => {
                cleanAmount(trans);
                range.transactions.push(trans);
                var cust = range.customers[trans.customer];
                if (!cust) {
                    range.customerCount++;
                    cust = range.customers[trans.customer] = { visits: 1, spent: vector * trans.amount, email: $scope.email == trans.to.email ? trans.from.email : trans.to.email };
                } else {
                    cust.visits++;
                    cust.spent += vector * trans.amount;
                }
                range.grandTotal += vector * trans.amount;
                range.totalTips += trans.tip;
                if (cust.spent > (range.highestPayingCustomer.spent || 0)) range.highestPayingCustomer = cust;
                if (cust.visits > (range.mostFrequentCustomer.visits || 0)) range.mostFrequentCustomer = cust;
                range.transactionCount++;

            };

            var calc = {
                "deposit Fee": (trans, range) => { },
                "deposit": (trans, range) => { },
                "tip": (trans, range) => { },
                "payment": (trans, range) => {
                    baseCalc(trans, range, 1);
                    range.totalSales += trans.amount;
                },
                "fee": (trans, range) => { },
                "withdrawal": (trans, range) => {
                    cleanAmount(trans);
                    range.totalWithdrawals += trans.amount + trans.details.withdrawalFee + trans.details.withdrawalFlatFee;
                    range.withdrawalFees += trans.details.withdrawalFee + trans.details.withdrawalFlatFee;
                    range.grandTotalWithdrawals += trans.amount;
                    range.withdrawalsCount++;
                    range.transactions.push(trans);
                },
                "withdraw Tips": (trans, range) => {
                    cleanAmount(trans);
                    range.totalTipWithdrawals += trans.tip;
                    range.tipWithdrawalsCount++;
                    range.transactions.push(trans);
                },
                "refund": (trans, range) => {
                    baseCalc(trans, range, -1);
                    range.totalRefunds += trans.amount;
                },
                "tip Refund": (trans, range) => { },
                "fee Refund": (trans, range) => { }
            };

            $scope.parseDate = date => {
                var dto = new Date(date);
                return dto.toLocaleString();
            };

            function Range() {
                this.totalSales = 0.0;
                this.totalRefunds = 0.0;
                this.grandTotal = 0.0;
                this.customerCount = 0;
                this.totalTips = 0.0;
                this.transactionCount = 0;
                this.totalWithdrawals = 0.0;
                this.withdrawalFees = 0.0;
                this.grandTotalWithdrawals = 0.0;
                this.withdrawalsCount = 0;
                this.totalTipWithdrawals = 0.0;
                this.tipWithdrawalsCount = 0.0;
                this.salesPerCustomer = () => (this.totalSales / this.customerCount).toFixed(2);
                this.refundsPerCustomer = () => (this.totalRefunds / this.customerCount).toFixed(2);
                this.grandTotalPerCustomer = () => (this.grandTotal / this.customerCount).toFixed(2);
                this.tipsPerCustomer = () => (this.totalTips / this.customerCount).toFixed(2);
                this.mostFrequentCustomer = {};
                this.highestPayingCustomer = {};
                this.transactionsPerCustomer = () => (this.transactionCount / this.customerCount).toFixed(1);
                this.salesPerTransaction = () => (this.totalSales / this.transactionCount).toFixed(2);
                this.refundsPerTransaction = () => (this.totalRefunds / this.transactionCount).toFixed(2);
                this.grandTotalPerTransaction = () => (this.grandTotal / this.transactionCount).toFixed(2);
                this.tipsPerTransaction = () => (this.totalTips / this.transactionCount).toFixed(2);
                this.averageWithdrawal = () => (this.totalWithdrawals / this.withdrawalsCount).toFixed(2);
                this.averageTipWithdrawal = () => (this.totalTipWithdrawals / this.tipWithdrawalsCount).toFixed(2);
                this.transactions = [];
                this.customers = {};
            };

            var addTrans = (key, trans) => {
                includedRanges(Number.MAX_SAFE_INTEGER - key.substring(0, key.length - 3)).forEach(range => {
                    if (!$scope.ranges[range]) $scope.ranges[range] = new Range();
                    calc[trans.type](trans, $scope.ranges[range]);
                });
            };

        }]).filter('capitalize', function () {
            return function (input) {
                return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
            };
        });
})();