package com.skat.voicechat;

import com.getcapacitor.BridgeActivity;
import com.skat.voicechat.plugins.VoicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(VoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}