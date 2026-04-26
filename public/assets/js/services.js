(function () {
  'use strict';

  angular
    .module('tradingApp')
    .service('ApiService', ApiService)
    .service('ToastService', ToastService);

  ApiService.$inject = ['$http', '$q', '$rootScope'];
  function ApiService($http, $q, $rootScope) {
    return {
      dashboard: function () {
        return request($http.get('/api/dashboard'), 'data');
      },
      watchlist: function () {
        return request($http.get('/api/watchlist'), 'data');
      },
      trades: function () {
        return request($http.get('/api/trades'), 'data');
      },
      logs: function () {
        return request($http.get('/api/logs?limit=500'), 'data');
      },
      settings: function () {
        return request($http.get('/api/settings'), 'data');
      },
      startBot: function () {
        return request($http.post('/api/bot/start'), 'raw');
      },
      stopBot: function () {
        return request($http.post('/api/bot/stop'), 'raw');
      },
      closeTrades: function (ids) {
        return request($http.post('/api/trades/close', { ids: ids }), 'raw');
      },
      closeAllTrades: function () {
        return request($http.post('/api/trades/close-all'), 'raw');
      },
      sellAsset: function (symbol) {
        return request($http.post('/api/bot/sell-asset', { symbol: symbol }), 'raw');
      },
      setStrategy: function (strategy, enabled) {
        return request($http.post('/api/settings/strategy', { strategy: strategy, enabled: enabled }), 'raw');
      },
      addWatchlistSymbol: function (symbol) {
        return request($http.post('/api/settings/watchlist', { symbol: symbol }), 'raw');
      },
      removeWatchlistSymbol: function (symbol) {
        return request($http.delete('/api/settings/watchlist/' + encodeURIComponent(symbol)), 'raw');
      },
    };

    function request(promise, responseType) {
      return promise
        .then(function (response) {
          var body = response.data || {};
          $rootScope.$broadcast('api:offline', false);

          if (!body.ok) {
            return $q.reject(normalizeError({ data: body, status: response.status }));
          }

          return responseType === 'raw' ? body : body[responseType];
        })
        .catch(function (error) {
          var normalized = normalizeError(error);
          $rootScope.$broadcast('api:offline', error.status <= 0);
          return $q.reject(normalized);
        });
    }

    function normalizeError(error) {
      var body = error && error.data ? error.data : {};
      var status = error && error.status ? error.status : 0;
      var message = body.error || body.message || error.statusText || error.message || 'Request failed';
      if (!status) message = 'Server is unreachable';
      return { message: message, status: status };
    }
  }

  ToastService.$inject = ['$timeout'];
  function ToastService($timeout) {
    var nextId = 1;
    var service = {
      items: [],
      success: function (message, title) { return push('success', title || 'Success', message); },
      error: function (message, title) { return push('danger', title || 'Error', message); },
      info: function (message, title) { return push('info', title || 'Info', message); },
      warning: function (message, title) { return push('warning', title || 'Warning', message); },
      remove: remove,
    };

    return service;

    function push(type, title, message) {
      var toast = { id: nextId++, type: type, title: title, message: message };
      service.items.push(toast);
      $timeout(function () { remove(toast.id); }, 4500);
      return toast;
    }

    function remove(id) {
      service.items = service.items.filter(function (item) {
        return item.id !== id;
      });
    }
  }
})();
