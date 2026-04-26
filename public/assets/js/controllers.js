(function () {
  'use strict';

  angular
    .module('tradingApp')
    .controller('ShellController', ShellController)
    .controller('DashboardController', DashboardController)
    .controller('WatchlistController', WatchlistController)
    .controller('TradesController', TradesController)
    .controller('LogsController', LogsController)
    .controller('SettingsController', SettingsController);

  ShellController.$inject = ['$scope', '$location', '$window', 'ToastService'];
  function ShellController($scope, $location, $window, ToastService) {
    var vm = this;

    vm.routes = [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/watchlist', label: 'Watchlist' },
      { path: '/trades', label: 'Trades' },
      { path: '/logs', label: 'Logs' },
      { path: '/settings', label: 'Settings' },
    ];
    vm.offline = false;
    vm.status = null;
    vm.toasts = ToastService.items;
    vm.dismissToast = ToastService.remove;
    vm.isActive = function (path) { return $location.path() === path; };
    vm.closeMenu = closeMenu;

    $scope.$watch(function () { return ToastService.items; }, function (items) {
      vm.toasts = items;
    });

    $scope.$on('api:offline', function (_, offline) {
      vm.offline = offline;
    });

    $scope.$on('bot:status', function (_, status) {
      vm.status = status;
    });

    function closeMenu() {
      var nav = $window.document.getElementById('appNav');
      if (!nav || !$window.bootstrap) return;
      var collapse = $window.bootstrap.Collapse.getInstance(nav);
      if (collapse) collapse.hide();
    }
  }

  DashboardController.$inject = ['$interval', '$rootScope', '$scope', '$timeout', '$window', 'APP_REFRESH_MS', 'ApiService', 'ToastService'];
  function DashboardController($interval, $rootScope, $scope, $timeout, $window, APP_REFRESH_MS, ApiService, ToastService) {
    var vm = this;
    var refreshTimer = null;

    vm.data = null;
    vm.loading = true;
    vm.actionLoading = null;
    vm.error = null;
    vm.success = null;
    vm.lastUpdated = null;
    vm.selectAll = false;
    vm.selectedHoldings = {};
    vm.refresh = refresh;
    vm.toggleBot = toggleBot;
    vm.toggleAllHoldings = toggleAllHoldings;
    vm.selectionCount = selectionCount;
    vm.sellSelected = sellSelected;
    vm.sellAll = sellAll;
    vm.sellExternal = sellExternal;
    vm.externalSelling = {};

    activate();

    function activate() {
      refresh(false);
      refreshTimer = $interval(function () { refresh(true); }, APP_REFRESH_MS);
      $scope.$on('$destroy', function () {
        if (refreshTimer) $interval.cancel(refreshTimer);
      });
    }

    function refresh(silent) {
      if (!silent) {
        vm.loading = true;
        vm.error = null;
      }

      return ApiService.dashboard()
        .then(function (data) {
          vm.data = normalizeDashboard(data);
          vm.lastUpdated = new Date();
          vm.error = null;
          vm.selectedHoldings = {};
          vm.selectAll = false;
          $rootScope.$broadcast('bot:status', vm.data);
        })
        .catch(function (error) {
          vm.error = error.message;
          if (!silent) ToastService.error(error.message, 'Dashboard');
        })
        .finally(function () {
          vm.loading = false;
        });
    }

    function normalizeDashboard(data) {
      data = data || {};
      data.cryptoAssets = data.cryptoAssets || [];
      data.openTrades = data.openTrades || [];
      return data;
    }

    function toggleBot() {
      var isRunning = vm.data && vm.data.isRunning;
      vm.actionLoading = 'bot';
      vm.error = null;
      vm.success = null;

      var request = isRunning ? ApiService.stopBot() : ApiService.startBot();
      request
        .then(function () {
          var message = isRunning ? 'Bot stopped.' : 'Bot started.';
          vm.success = message;
          ToastService.success(message);
          return refresh(true);
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Bot control');
        })
        .finally(function () {
          vm.actionLoading = null;
          clearSuccess();
        });
    }

    function toggleAllHoldings() {
      vm.selectedHoldings = {};
      if (!vm.selectAll || !vm.data) return;

      vm.data.cryptoAssets.forEach(function (asset) {
        if (asset.tradeId) vm.selectedHoldings[asset.tradeId] = true;
      });
    }

    function selectionCount() {
      return Object.keys(vm.selectedHoldings).filter(function (id) {
        return vm.selectedHoldings[id];
      }).length;
    }

    function selectedIds() {
      return Object.keys(vm.selectedHoldings).filter(function (id) {
        return vm.selectedHoldings[id];
      });
    }

    function sellSelected() {
      var ids = selectedIds();
      if (!ids.length) {
        ToastService.info('Select at least one position.');
        return;
      }

      closePositions(function () { return ApiService.closeTrades(ids); }, 'Closing selected position(s).');
    }

    function sellAll() {
      if (!$window.confirm('Sell all open positions?')) return;
      closePositions(ApiService.closeAllTrades, 'Closing all open positions.');
    }

    function closePositions(requestFactory, fallbackMessage) {
      vm.actionLoading = 'sell';
      vm.error = null;
      vm.success = null;

      requestFactory()
        .then(function (response) {
          var message = response.message || fallbackMessage;
          vm.success = message;
          ToastService.success(message);
          $timeout(function () { refresh(true); }, 2500);
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Close position');
        })
        .finally(function () {
          vm.actionLoading = null;
          clearSuccess();
        });
    }

    function sellExternal(symbol) {
      if (!$window.confirm('Sell all ' + symbol.replace('USDT', '') + ' holdings?')) return;
      vm.externalSelling[symbol] = true;
      vm.error = null;
      vm.success = null;

      ApiService.sellAsset(symbol)
        .then(function (response) {
          var message = response.message || ('Sold ' + symbol);
          vm.success = message;
          ToastService.success(message);
          $timeout(function () { refresh(true); }, 1500);
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Sell asset');
        })
        .finally(function () {
          vm.externalSelling[symbol] = false;
        });
    }

    function clearSuccess() {
      $timeout(function () { vm.success = null; }, 3500);
    }
  }

  WatchlistController.$inject = ['ApiService', 'ToastService'];
  function WatchlistController(ApiService, ToastService) {
    var vm = this;

    vm.rows = [];
    vm.rawRows = [];
    vm.loading = true;
    vm.error = null;
    vm.lastUpdated = null;
    vm.sort = { column: null, direction: 1 };
    vm.refresh = refresh;
    vm.sortBy = sortBy;
    vm.sortClass = sortClass;
    vm.rsiClass = rsiClass;
    vm.signalClass = signalClass;

    refresh(false);

    function refresh() {
      vm.loading = true;
      vm.error = null;

      return ApiService.watchlist()
        .then(function (rows) {
          vm.rawRows = rows || [];
          applySort();
          vm.lastUpdated = new Date();
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Watchlist');
        })
        .finally(function () {
          vm.loading = false;
        });
    }

    function sortBy(column) {
      if (vm.sort.column === column) vm.sort.direction *= -1;
      else vm.sort = { column: column, direction: 1 };
      applySort();
    }

    function applySort() {
      var rows = vm.rawRows.slice();
      if (vm.sort.column) {
        rows.sort(function (a, b) {
          return compareValues(a[vm.sort.column], b[vm.sort.column]) * vm.sort.direction;
        });
      }
      vm.rows = rows;
    }

    function compareValues(a, b) {
      if (a === null || a === undefined) a = '';
      if (b === null || b === undefined) b = '';
      if (angular.isNumber(a) && angular.isNumber(b)) return a - b;
      return String(a).localeCompare(String(b));
    }

    function sortClass(column) {
      if (vm.sort.column !== column) return 'sortable';
      return vm.sort.direction === 1 ? 'sortable sort-asc' : 'sortable sort-desc';
    }

    function rsiClass(value) {
      if (value < 35) return 'text-success';
      if (value > 65) return 'text-danger';
      return 'text-body';
    }

    function signalClass(value) {
      return 'signal-' + (value || 'HOLD');
    }
  }

  TradesController.$inject = ['$q', 'ApiService', 'ToastService'];
  function TradesController($q, ApiService, ToastService) {
    var vm = this;

    vm.allTrades = [];
    vm.trades = [];
    vm.symbols = [];
    vm.loading = true;
    vm.error = null;
    vm.lastUpdated = null;
    vm.filters = { symbol: '', status: '', strategy: '', reason: '', search: '' };
    vm.sort = { column: 'entryTime', direction: -1 };
    vm.refresh = refresh;
    vm.applyFilters = applyFilters;
    vm.clearFilters = clearFilters;
    vm.sortBy = sortBy;
    vm.sortClass = sortClass;

    refresh(false);

    function refresh() {
      vm.loading = true;
      vm.error = null;

      return $q.all({
        trades: ApiService.trades(),
        settings: ApiService.settings(),
      })
        .then(function (result) {
          vm.allTrades = result.trades || [];
          vm.symbols = (result.settings && result.settings.watchlist) || [];
          applyFilters();
          vm.lastUpdated = new Date();
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Trades');
        })
        .finally(function () {
          vm.loading = false;
        });
    }

    function applyFilters() {
      var filters = vm.filters;
      var filtered = vm.allTrades.filter(function (trade) {
        if (filters.symbol && trade.symbol !== filters.symbol) return false;
        if (filters.status && trade.status !== filters.status) return false;
        if (filters.strategy && (trade.strategy || '15m') !== filters.strategy) return false;
        if (filters.reason && trade.closeReason !== filters.reason) return false;
        if (filters.search && String(trade.id).toLowerCase().indexOf(filters.search.toLowerCase()) === -1) return false;
        return true;
      });

      vm.trades = sortRows(filtered);
    }

    function clearFilters() {
      vm.filters = { symbol: '', status: '', strategy: '', reason: '', search: '' };
      applyFilters();
    }

    function sortBy(column) {
      if (vm.sort.column === column) vm.sort.direction *= -1;
      else vm.sort = { column: column, direction: -1 };
      applyFilters();
    }

    function sortRows(rows) {
      return rows.slice().sort(function (a, b) {
        return compareValues(a[vm.sort.column], b[vm.sort.column]) * vm.sort.direction;
      });
    }

    function compareValues(a, b) {
      if (a === null || a === undefined) a = '';
      if (b === null || b === undefined) b = '';
      if (angular.isNumber(a) && angular.isNumber(b)) return a - b;
      return String(a).localeCompare(String(b));
    }

    function sortClass(column) {
      if (vm.sort.column !== column) return 'sortable';
      return vm.sort.direction === 1 ? 'sortable sort-asc' : 'sortable sort-desc';
    }
  }

  LogsController.$inject = ['ApiService', 'ToastService'];
  function LogsController(ApiService, ToastService) {
    var vm = this;

    vm.allLogs = [];
    vm.logs = [];
    vm.loading = true;
    vm.error = null;
    vm.lastUpdated = null;
    vm.filters = { level: '', search: '' };
    vm.refresh = refresh;
    vm.applyFilters = applyFilters;
    vm.levelClass = levelClass;

    refresh(false);

    function refresh() {
      vm.loading = true;
      vm.error = null;

      return ApiService.logs()
        .then(function (logs) {
          vm.allLogs = logs || [];
          applyFilters();
          vm.lastUpdated = new Date();
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Logs');
        })
        .finally(function () {
          vm.loading = false;
        });
    }

    function applyFilters() {
      var filters = vm.filters;
      vm.logs = vm.allLogs.filter(function (entry) {
        if (filters.level && entry.level !== filters.level) return false;
        if (filters.search && String(entry.message || '').toLowerCase().indexOf(filters.search.toLowerCase()) === -1) return false;
        return true;
      });
    }

    function levelClass(level) {
      if (level === 'ERROR') return 'text-bg-danger';
      if (level === 'WARN') return 'text-bg-warning';
      return 'text-bg-secondary';
    }
  }

  SettingsController.$inject = ['$window', 'ApiService', 'ToastService'];
  function SettingsController($window, ApiService, ToastService) {
    var vm = this;

    vm.data = { watchlist: [], tick15mEnabled: true, tick5mEnabled: true };
    vm.loading = true;
    vm.error = null;
    vm.success = null;
    vm.newSymbol = '';
    vm.adding = false;
    vm.savingStrategy = null;
    vm.removing = {};
    vm.refresh = refresh;
    vm.toggleStrategy = toggleStrategy;
    vm.addSymbol = addSymbol;
    vm.removeSymbol = removeSymbol;

    refresh(false);

    function refresh() {
      vm.loading = true;
      vm.error = null;

      return ApiService.settings()
        .then(function (data) {
          vm.data = data || vm.data;
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Settings');
        })
        .finally(function () {
          vm.loading = false;
        });
    }

    function toggleStrategy(strategy) {
      var enabled = strategy === '15m' ? !vm.data.tick15mEnabled : !vm.data.tick5mEnabled;
      vm.savingStrategy = strategy;
      vm.error = null;
      vm.success = null;

      ApiService.setStrategy(strategy, enabled)
        .then(function () {
          if (strategy === '15m') vm.data.tick15mEnabled = enabled;
          else vm.data.tick5mEnabled = enabled;

          var message = (strategy === '15m' ? '15m Trend' : '5m Bounce') + (enabled ? ' enabled.' : ' disabled.');
          vm.success = message;
          ToastService.success(message);
        })
        .catch(function (error) {
          vm.error = error.message;
          ToastService.error(error.message, 'Strategy');
        })
        .finally(function () {
          vm.savingStrategy = null;
        });
    }

    function addSymbol() {
      var symbol = String(vm.newSymbol || '').toUpperCase().trim();
      if (!symbol) return;

      vm.adding = true;
      vm.error = null;
      vm.success = null;

      ApiService.addWatchlistSymbol(symbol)
        .then(function (response) {
          vm.data.watchlist = response.watchlist || [];
          vm.newSymbol = '';
          vm.success = symbol + ' added to watchlist.';
          ToastService.success(vm.success);
        })
        .catch(function (error) {
          vm.success = null;
          vm.error = error.message;
          ToastService.error(error.message, 'Watchlist');
        })
        .finally(function () {
          vm.adding = false;
        });
    }

    function removeSymbol(symbol) {
      if (!$window.confirm('Remove ' + symbol + ' from watchlist?')) return;

      vm.removing[symbol] = true;
      vm.error = null;
      vm.success = null;

      ApiService.removeWatchlistSymbol(symbol)
        .then(function (response) {
          vm.data.watchlist = response.watchlist || [];
          vm.success = symbol + ' removed.';
          ToastService.success(vm.success);
        })
        .catch(function (error) {
          vm.success = null;
          vm.error = error.message;
          ToastService.error(error.message, 'Watchlist');
        })
        .finally(function () {
          vm.removing[symbol] = false;
        });
    }
  }
})();
