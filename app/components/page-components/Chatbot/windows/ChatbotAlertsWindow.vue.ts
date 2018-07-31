import {cloneDeep} from 'lodash';
import { Component } from 'vue-property-decorator';
import ChatbotAlertsBase from 'components/page-components/Chatbot/module-bases/ChatbotAlertsBase.vue';
import NavItem from 'components/shared/NavItem.vue';
import NavMenu from 'components/shared/NavMenu.vue';
import ChatbotNewAlertModalWindow from 'components/page-components/Chatbot/windows/ChatbotNewAlertModalWindow.vue';
import DropdownMenu from 'components/shared/DropdownMenu.vue';

import {
  IChatAlertsResponse
} from 'services/chatbot/chatbot-interfaces';

@Component({
  components: {
    NavMenu,
    NavItem,
    ChatbotNewAlertModalWindow,
    DropdownMenu
  }
})
export default class ChatbotAlertsWindow extends ChatbotAlertsBase {
  selectedType = 'follow';

  get selectedTypeData() {
    console.log(this.alertTypes);
    return this.alertTypes[this.selectedType];
  }

  get selectedTypeMessages() {
    return this.selectedTypeData.messages;
  }

  get selectedTypeTableTitles() {
    return Object.keys(this.selectedTypeMessages);
  }

  get selectedTypeTableColumns() {
    const message = this.selectedTypeMessages[0];
    if (message) return Object.keys(message);

    return [];
  }

  isEnabled(type: string) {
    return this.alertTypes[type].enabled;
  }

  showNewChatAlertWindow() {
    this.$modal.show('new-alert', {
      onSubmit: (newAlert: any) => {
        this.addNewAlert(this.selectedType, newAlert);
      }
    });
  }

  onEdit(message: any, index: number) {
    this.$modal.show('new-alert', {
      editedAlert: message,
      onSubmit: (updatedAlert: any) => {
        this.spliceAlertMessages(this.selectedType, index, updatedAlert);
      }
    });
  }

  onDelete(index: number) {
    this.spliceAlertMessages(this.selectedType, index, null);
  }

  onDone() {
    this.chatbotCommonService.closeChildWindow();
  }

  // filters
  formatNumber(value: any, dp?: number) {
    if (isNaN(Number(value))) {
      return value;
    }

    if (dp === undefined) dp = 2;

    return value.toLocaleString(undefined, {
      maximumFractionDigits: dp,
      minimumFractionDigits: dp
    });
  }

  formatHeader(column: string) {
    switch (column) {
      case 'is_gifted':
        return 'is gifted';
      default:
        return column;
    }
  }

  formatValue(value: any, column: string) {
    switch (column) {
      case 'amount':
        return this.formatNumber(value, 2);
      case 'message':
        return value;
      case 'is_gifted':
        return value === true ? 'Yes' : 'No';
      default:
        return value;
    }
  }
}