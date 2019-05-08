import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
    gameSocket: service(),
    favicon: service(),
    gameApi: service(),
    selectedChannel: null,
    chatMessage: '',
    scrollPaused: false,
    newConversation: false,
    newConversationList: [],
    
    channelsByActivity: function() {
       return this.get('model.chat').sort(function(a,b){
        return new Date(b.last_activity) - new Date(a.last_activity);
       });
    }.property('model.chat.@each.last_activity'),
    
    
    resetOnExit: function() {
        this.set('selectedChannel', null);
        this.set('chatMessage', '');
        this.set('scrollPaused', false);
        this.set('newConversation', false);
        this.set('newConversationList', []);
    },
    
    onChatMessage: function(msg, timestamp) {
        let splitMsg = msg.split('|');
        let channelKey = splitMsg[0];
        let channelTitle = splitMsg[1];
        let newMessage = splitMsg[2];
      
        let channel = this.getChannel(channelKey);
        if (!channel) {
          channel = this.addPageChannel(channelKey, channelTitle);
        }
        channel.messages.pushObject({message: newMessage, timestamp: timestamp });
        Ember.set(channel, 'last_activity', Date.now());
        if (channelKey === this.get('selectedChannel.key')) {
            this.scrollChatWindow();
            if (channel.is_page) {
              this.markPageThreadRead(channel.key);
            }
        }
        else {
            let messageCount = channel.new_messages || 0;
            Ember.set(channel, 'new_messages', messageCount + 1);
        }
        // No browser notifications for channels because it's too spammy.
        this.get('gameSocket').highlightFavicon();
        if (channel.is_page) {
          this.get('gameSocket').notify(`New conversation activity in ${channelTitle}.`);
        }
    },
    
    addPageChannel: function(key, title) {
      let channel = { title: title, 
        key: key, 
        enabled: true, 
        allowed: true, 
        is_page: true, 
        muted: false,
        messages: [],
        who: []
      };
      this.get('model.chat').pushObject(channel);
      return channel;
    },
    
    scrollChatWindow: function() {
      // Unless scrolling paused 
      if (this.get('scrollPaused')) {
        return;
      }
      
      try {
        let chatWindow = $('#chat-window')[0];
        if (chatWindow) {
            $('#chat-window').stop().animate({
                scrollTop: chatWindow.scrollHeight
            }, 400);    
        }  
      }
      catch(error) {
        // This happens sometimes when transitioning away from screen.
      }   
    },
    
    setupCallback: function() {
        let self = this;
        this.get('gameSocket').set('chatCallback', function(msg, timestamp) {
            self.onChatMessage(msg, timestamp) } );
    },
    
    getChannel: function(channelKey) {
      return this.get('model.chat').find(c => c.key === channelKey);
    },
    
    markPageThreadRead: function(threadId) {
      let api = this.get('gameApi');
      api.requestOne('markPageThreadRead', { thread_id: threadId }, null)
      .then( (response) => {
          if (response.error) {
              return;
          }
      }); 
    },
    
    actions: {
        scrollDown: function() {
            this.scrollChatWindow();
        },
        
        scrollDownPages: function() {
            this.scrollPageWindow();
        },
        
        changeChannel: function(channel) {
            this.set('selectedChannel', channel);
            Ember.set(channel, 'new_messages', null);
            Ember.set(channel, 'is_unread', false);
            if (this.get('selectedChannel.is_page'))  {
              this.markPageThreadRead(channel.key);
            } 
            let self = this;
            setTimeout(() => self.scrollChatWindow(), 150, self);
            
        },
        
        conversationListChanged(newList) {
            this.set('newConversationList', newList);
        },
        
        joinChannel: function(channelName) {
            let api = this.get('gameApi');
                        
            api.requestOne('joinChannel', { channel: channelName }, null)
            .then( (response) => {
                if (response.error) {
                    return;
                }
                this.send('reloadModel');
            });
        },
        
        leaveChannel: function() {
            let api = this.get('gameApi');
            let channelKey = this.get('selectedChannel.key');
                        
            api.requestOne('leaveChannel', { channel: channelKey }, null)
            .then( (response) => {
                if (response.error) {
                    return;
                }
                this.send('reloadModel');
            });
        },
        
        muteChannel: function(mute) {
            let api = this.get('gameApi');
            let channelKey = this.get('selectedChannel.key');
                        
            api.requestOne('muteChannel', { channel: channelKey, mute: mute }, null)
            .then( (response) => {
                if (response.error) {
                    return;
                }
                this.send('reloadModel');
            });
        },
        
        newConversation: function() {
          this.set('selectedChannel', null);
          this.set('newConversation', true);
        },
        
        send: function() {
            let api = this.get('gameApi');
            let channelKey = this.get('selectedChannel.key');
            let message = this.get('chatMessage');
            this.set(`chatMessage`, '');
                      
            if (this.get('selectedChannel.is_page'))  {
              api.requestOne('sendPage', { thread_id: channelKey, message: message }, null)
              .then( (response) => {
                  if (response.error) {
                      return;
                  }
              }); 
            } else {
              api.requestOne('chatTalk', { channel: channelKey, message: message }, null)
              .then( (response) => {
                  if (response.error) {
                      return;
                  }
              });
            }
        },
        
        selectPageGroup: function(group) {
          this.set('selectedPageGroup', group);
          this.scrollPageWindow();
        },
        
        startConversation: function() {
          let api = this.get('gameApi');
          let message = this.get('chatMessage');
          let names = (this.get('newConversationList') || []).map(p => p.name);
          this.set(`chatMessage`, '');
          this.set('newConversation', false);
          this.set('newConversationList', []);

          api.requestOne('sendPage', { names: names, message: message }, null)
          .then( (response) => {
              if (response.error) {
                  return;
              }
              let channel = this.getChannel(response.thread);              
              this.send('changeChannel', channel);
          });
        },

        pauseScroll() {
          this.set('scrollPaused', true);
        },
        unpauseScroll() {
          this.set('scrollPaused', false);
          this.scrollChatWindow();
        }
    }
    
});