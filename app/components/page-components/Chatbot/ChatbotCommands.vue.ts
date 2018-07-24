import { Component, Prop } from 'vue-property-decorator';
import ChatbotDefaultCommands from 'components/page-components/Chatbot/Commands/ChatbotDefaultCommands.vue';
import ChatbotCustomCommands from 'components/page-components/Chatbot/Commands/ChatbotCustomCommands.vue';
import ChatbotBase from 'components/page-components/Chatbot/ChatbotBase.vue';
@Component({
  components: {
    ChatbotDefaultCommands,
    ChatbotCustomCommands
  }
})
export default class ChatbotCommands extends ChatbotBase {
  tabs: { name: String; value: String }[] = [
    {
      name: 'Custom Commands',
      value: 'custom'
    },
    {
      name: 'Default Commands',
      value: 'default'
    },
    {
      name: 'Variables',
      value: 'variables'
    }
  ];

  selectedTab: String = 'custom';

  onSelectTab(tab: String) {
    this.selectedTab = tab;
  }
}

