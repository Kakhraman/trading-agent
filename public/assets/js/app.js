(function () {
  'use strict';

  angular
    .module('tradingApp', ['ngRoute'])
    .constant('APP_REFRESH_MS', 15000)
    .config(configureRoutes)
    .filter('appNumber', appNumber)
    .filter('appMoney', appMoney)
    .filter('appSigned', appSigned)
    .filter('appDateTime', appDateTime)
    .filter('strategyName', strategyName);

  configureRoutes.$inject = ['$routeProvider', '$locationProvider'];
  function configureRoutes($routeProvider, $locationProvider) {
    $locationProvider
      .html5Mode({ enabled: true, requireBase: true })
      .hashPrefix('');

    $routeProvider
      .when('/dashboard', {
        templateUrl: '/views/dashboard.html',
        controller: 'DashboardController',
        controllerAs: 'vm',
      })
      .when('/watchlist', {
        templateUrl: '/views/watchlist.html',
        controller: 'WatchlistController',
        controllerAs: 'vm',
      })
      .when('/trades', {
        templateUrl: '/views/trades.html',
        controller: 'TradesController',
        controllerAs: 'vm',
      })
      .when('/logs', {
        templateUrl: '/views/logs.html',
        controller: 'LogsController',
        controllerAs: 'vm',
      })
      .when('/settings', {
        templateUrl: '/views/settings.html',
        controller: 'SettingsController',
        controllerAs: 'vm',
      })
      .otherwise('/dashboard');
  }

  appNumber.$inject = ['$filter'];
  function appNumber($filter) {
    return function (value, digits) {
      if (value === null || value === undefined || value === '') return '-';
      var fixed = angular.isNumber(digits) ? digits : 2;
      return $filter('number')(parseFloat(value), fixed);
    };
  }

  appMoney.$inject = ['$filter'];
  function appMoney($filter) {
    return function (value, digits) {
      if (value === null || value === undefined || value === '') return '-';
      var fixed = angular.isNumber(digits) ? digits : 2;
      return '$' + $filter('number')(parseFloat(value), fixed);
    };
  }

  appSigned.$inject = ['$filter'];
  function appSigned($filter) {
    return function (value, digits, suffix) {
      if (value === null || value === undefined || value === '') return '-';
      var numberValue = parseFloat(value);
      var sign = numberValue >= 0 ? '+' : '';
      var fixed = angular.isNumber(digits) ? digits : 2;
      return sign + $filter('number')(numberValue, fixed) + (suffix || '');
    };
  }

  function appDateTime() {
    return function (value) {
      if (!value) return '-';
      return new Date(value).toLocaleString();
    };
  }

  function strategyName() {
    return function (value) {
      return value === '5m' ? '5m Bounce' : '15m Trend';
    };
  }
})();
