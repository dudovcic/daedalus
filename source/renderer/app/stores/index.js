// @flow
import { remote } from 'electron';

import { action, observable } from 'mobx';
import { values } from 'ramda';
import environment from '../../../common/environment';
import { Logger } from '../../../common/logging';
import { netPeerCount } from '../api/etc/netPeerCount';
import {
  networkStatusFactory,
  peerCountConnectionChecker,
  validResponseConnectionChecker,
} from '../api/NetworkStatus';
import { getEtcSyncProgress } from '../api/SyncProgress';
import type { TokenStores } from '../tokens';
import { setupTokenStores } from '../tokens';
import type { AdaStoresMap } from './ada';
import setupAdaStores from './ada';
import AppStore from './AppStore';
import type { EtcStoresMap } from './etc';
import setupEtcStores from './etc';
import NetworkStatusStore from './NetworkStatusStore';
import ProfileStore from './ProfileStore';
import SidebarStore from './SidebarStore';
import UiDialogsStore from './UiDialogsStore';
import UiNotificationsStore from './UiNotificationsStore';
import WalletBackupStore from './WalletBackupStore';
import WindowStore from './WindowStore';

export const storeClasses = {
  profile: ProfileStore,
  app: AppStore,
  sidebar: SidebarStore,
  walletBackup: WalletBackupStore,
  window: WindowStore,
  uiDialogs: UiDialogsStore,
  uiNotifications: UiNotificationsStore,
};

export type StoresMap = {
  profile: ProfileStore,
  app: AppStore,
  router: Object,
  sidebar: SidebarStore,
  walletBackup: WalletBackupStore,
  window: WindowStore,
  uiDialogs: UiDialogsStore,
  uiNotifications: UiNotificationsStore,
  networkStatus: NetworkStatusStore,
  ada: AdaStoresMap,
  etc: EtcStoresMap,
  tokens: TokenStores,
};

// Constant that does never change during lifetime
const stores = observable({
  profile: null,
  router: null,
  app: null,
  sidebar: null,
  walletBackup: null,
  window: null,
  uiDialogs: null,
  uiNotifications: null,
  networkStatus: null,
  ada: null,
  etc: null,
  tokens: null,
});

const CHECK_INTERVAL = 2000;
const ca = remote.getGlobal('ca');
const getConnectionStatus = () =>
  environment.isDev()
    ? validResponseConnectionChecker(CHECK_INTERVAL, () => getEtcSyncProgress(ca), Logger)
    : peerCountConnectionChecker(CHECK_INTERVAL, () => netPeerCount({ ca }), Logger);

const getNetworkStatus = () =>
  networkStatusFactory(getConnectionStatus(), () => getEtcSyncProgress(ca));

// Set up and return the stores for this app -> also used to reset all stores to defaults
export default action(
  (api, actions, router): StoresMap => {
    // Assign mobx-react-router only once
    if (stores.router == null) stores.router = router;
    // All other stores have our lifecycle
    Object.keys(storeClasses).forEach(name => {
      if (stores[name]) stores[name].teardown();
      stores[name] = new storeClasses[name](stores, api, actions);
      stores[name].initialize();
    });

    if (stores.networkStatus) {
      stores.networkStatus.teardown();
    }
    stores.networkStatus = new NetworkStatusStore(
      getNetworkStatus(),
      actions.networkStatus.isSyncedAndReady,
    );
    stores.networkStatus.initialize();

    // Add currency specific stores
    if (environment.API === 'ada') {
      stores.ada = setupAdaStores(stores, api, actions);
    } else if (environment.API === 'etc') {
      stores.etc = setupEtcStores(stores, api, actions);
      values(stores.tokens).forEach(store => store.teardown());
      stores.tokens = setupTokenStores(stores.etc.wallets);
    }

    return stores;
  },
);
