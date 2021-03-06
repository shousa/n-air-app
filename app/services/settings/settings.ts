import { StatefulService, mutation } from 'services/stateful-service';
import {
  obsValuesToInputValues,
  inputValuesToObsValues,
  TObsValue,
  TFormData,
  IListOption,
  IListInput
} from '../../components/shared/forms/Input';
import { nodeObs } from '../obs-api';
import { SourcesService } from 'services/sources';
import { Inject } from '../../util/injector';
import { AudioService, E_AUDIO_CHANNELS } from 'services/audio';
import { WindowsService } from 'services/windows';
import { UserService } from 'services/user';
import Utils from '../utils';
import { AppService } from 'services/app';
import {
  VideoEncodingOptimizationService,
  IOutputSettings
} from '../video-encoding-optimizations';
import { ISettingsSubCategory, ISettingsServiceApi } from './settings-api';
import { $t } from 'services/i18n';


export interface ISettingsState {
  General: {
    KeepRecordingWhenStreamStops: boolean;
    RecordWhenStreaming: boolean;
    WarnBeforeStartingStream: boolean;
    WarnBeforeStoppingStream: boolean;
    SnappingEnabled: boolean;
    SnapDistance: number;
    ScreenSnapping: boolean;
    SourceSnapping: boolean;
    CenterSnapping: boolean;
  };
  Stream: {
    key: string;
    streamType: string;
  };
  Output: Dictionary<TObsValue>;
  Video: {
    Base: string;
    Output: string;
    FPSType: string;
    FPSCommon?: string;
    FPSInt?: number;
    FPSNum?: number;
    FPSDen?: number;
    ScaleType: string;
  };
  Audio: Dictionary<TObsValue>;
  Advanced: {
    DelayEnable: boolean;
    DelaySec: number;
  };
}

declare type TSettingsFormData = Dictionary<ISettingsSubCategory[]>;

const niconicoResolutions = [
  '1280x720',
  '800x450',
  '640x360'
];

const niconicoResolutionValues = niconicoResolutions.map(res => ({
  [res]: res
}));

export class SettingsService extends StatefulService<ISettingsState>
  implements ISettingsServiceApi {
  static initialState = {};

  static convertFormDataToState(
    settingsFormData: TSettingsFormData
  ): ISettingsState {
    const settingsState: Partial<ISettingsState> = {};
    for (const groupName in settingsFormData) {
      settingsFormData[groupName].forEach(subGroup => {
        subGroup.parameters.forEach(parameter => {
          settingsState[groupName] = settingsState[groupName] || {};
          settingsState[groupName][parameter.name] = parameter.value;
        });
      });
    }

    return settingsState as ISettingsState;
  }

  @Inject() private sourcesService: SourcesService;

  @Inject() private audioService: AudioService;

  @Inject() private windowsService: WindowsService;

  @Inject() private appService: AppService;

  @Inject() private userService: UserService;

  @Inject()
  private videoEncodingOptimizationService: VideoEncodingOptimizationService;

  init() {
    this.loadSettingsIntoStore();
  }

  private isNiconicoLoggedIn() {
    return this.userService.isLoggedIn() && this.userService.platform.type === 'niconico';
  }

  loadSettingsIntoStore() {
    // load configuration from nodeObs to state
    const settingsFormData = {};
    this.getCategories().forEach(categoryName => {
      settingsFormData[categoryName] = this.getSettingsFormData(categoryName);
    });
    this.SET_SETTINGS(SettingsService.convertFormDataToState(settingsFormData));

    // ensure 'custom streaming server'
    this.setSettings('Stream', [
      {
        nameSubCategory: 'Untitled',
        parameters: [
          {
            name: 'streamType',
            type: 'OBS_PROPERTY_LIST',
            description: 'Stream Type',
            value: 'rtmp_custom',
          }
        ]
      }
    ]);
  }

  showSettings(categoryName?: string) {
    this.windowsService.showWindow({
      componentName: 'Settings',
      queryParams: { categoryName },
      size: {
        width: 800,
        height: 800
      }
    });
  }

  advancedSettingEnabled(): boolean {
    return (
      Utils.isDevMode() || this.appService.state.argv.includes('--adv-settings')
    );
  }

  getCategories(): string[] {
    let categories: string[] = nodeObs.OBS_settings_getListCategories();

    if (this.isNiconicoLoggedIn()) {
      categories = categories.filter(x => x !== 'Stream');
    }

    // if (this.advancedSettingEnabled()) categories = categories.concat(['Experimental']);

    return categories;
  }

  getSettingsFormData(categoryName: string): ISettingsSubCategory[] {
    if (categoryName === 'Audio') return this.getAudioSettingsFormData();
    const settings = nodeObs.OBS_settings_getSettings(categoryName);

    // Names of settings that are disabled because we
    // have not implemented them yet.
    const BLACK_LIST_NAMES = [
      'SysTrayMinimizeToTray',
      'ReplayBufferWhileStreaming',
      'KeepReplayBufferStreamStops',
      'SysTrayEnabled',
      'CenterSnapping',
      'HideProjectorCursor',
      'ProjectorAlwaysOnTop',
      'SaveProjectors',
      'SysTrayWhenStarted',
      'RecRBSuffix',
      'LowLatencyEnable',
      'BindIP',
      'FilenameFormatting',
      'MaxRetries',
      'NewSocketLoopEnable',
      'OverwriteIfExists',
      'RecRBPrefix',
      'Reconnect',
      'RetryDelay',
      'DisableAudioDucking',
    ];

    // We inject niconico specific resolutions
    if (categoryName === 'Video') {
      const outputSettings = this.findSetting(settings, 'Untitled', 'Output');

      if (outputSettings) {
        // filter resolutions if duplicated in the meaning of value
        outputSettings.values = outputSettings.values
          .filter((x: {[key: string]: string}) => {
            // one item has only one key-value pair
            return !Object.keys(x).some(y => niconicoResolutions.includes(x[y]));
          });
        outputSettings.values.unshift(...niconicoResolutionValues);
      }
    }

    if (categoryName === 'Advanced') {
      // 入力フォームで0未満を設定できないようにするための措置
      const delaySecSetting = this.findSetting(settings, 'Stream Delay', 'DelaySec');
      if (delaySecSetting) {
        delaySecSetting.type = 'OBS_PROPERTY_UINT';
      }
    }

    for (const group of settings) {
      group.parameters = obsValuesToInputValues(
        categoryName,
        group.nameSubCategory,
        group.parameters,
        {
          disabledFields: BLACK_LIST_NAMES,
          transformListOptions: true
        }
      );
    }

    // We hide the stream type settings
    if (categoryName === 'Stream') {
      const setting = this.findSetting(settings, 'Untitled', 'streamType');
      if (setting) {
        setting.visible = false;
      }
    }

    // We hide the encoder preset and settings if the optimized ones are in used
    if (
      categoryName === 'Output' &&
      this.videoEncodingOptimizationService.getIsUsingEncodingOptimizations()
    ) {
      const outputSettings: IOutputSettings = this.videoEncodingOptimizationService.getCurrentOutputSettings();

      const indexSubCategory = settings.indexOf(
        settings.find((category: any) => {
          return category.nameSubCategory === 'Streaming';
        })
      );

      const parameters = settings[indexSubCategory].parameters;

      // Setting preset visibility
      const indexPreset = parameters.indexOf(
        parameters.find((parameter: any) => {
          return parameter.name === outputSettings.presetField;
        })
      );
      settings[indexSubCategory].parameters[indexPreset].visible = false;

      // Setting encoder settings value
      const indexX264Settings = parameters.indexOf(
        parameters.find((parameter: any) => {
          return parameter.name === outputSettings.encoderSettingsField;
        })
      );
      settings[indexSubCategory].parameters[indexX264Settings].visible = false;
    }

    if (categoryName === 'Output') {
      const indexSubCategory = settings.findIndex((category: any) => {
        return category.nameSubCategory === 'Streaming';
      });

      const parameters = settings[indexSubCategory].parameters;

      // カスタムビットレートにしかならない前提があるので無意味、ということで隠す
      const parameterEnforceBitrate = parameters.find((parameter: any) => {
        return parameter.name === 'EnforceBitrate';
      });
      if (parameterEnforceBitrate) {
        parameterEnforceBitrate.visible = false;
      }

      // EnforceBitrateと同じだが詳細と基本で別の項目として出てくる
      const parameterApplyServiceSettings = parameters.find((parameter: any) => {
        return parameter.name === 'ApplyServiceSettings';
      });
      if (parameterApplyServiceSettings) {
        parameterApplyServiceSettings.visible = false;
      }
    }

    // これ以上消すものが増えるなら、フィルタリング機構は整備したほうがよいかもしれない

    return settings;
  }

  /**
   * Returns some information about the user's streaming settings.
   * This is used in aggregate to improve our optimized video encoding.
   *
   * P.S. Settings needs a refactor... badly
   */
  getStreamEncoderSettings() {
    const output = this.getSettingsFormData('Output');
    const video = this.getSettingsFormData('Video');

    const encoder = this.findSettingValue(output, 'Streaming', 'Encoder') ||
      this.findSettingValue(output, 'Streaming', 'StreamEncoder');
    const preset = this.findSettingValue(output, 'Streaming', 'preset') ||
      this.findSettingValue(output, 'Streaming', 'Preset') ||
      this.findSettingValue(output, 'Streaming', 'NVENCPreset') ||
      this.findSettingValue(output, 'Streaming', 'QSVPreset') ||
      this.findSettingValue(output, 'Streaming', 'target_usage') ||
      this.findSettingValue(output, 'Streaming', 'QualityPreset') ||
      this.findSettingValue(output, 'Streaming', 'AMDPreset');
    const bitrate = this.findSettingValue(output, 'Streaming', 'bitrate') ||
      this.findSettingValue(output, 'Streaming', 'VBitrate');
    const baseResolution = this.findSettingValue(video, 'Untitled', 'Base');
    const outputResolution = this.findSettingValue(video, 'Untitled', 'Output');

    return  {
      encoder,
      preset,
      bitrate,
      baseResolution,
      outputResolution
    };
  }

  private findSetting(settings: ISettingsSubCategory[], category: string, setting: string) {
    const subCategory = settings.find(subCategory => subCategory.nameSubCategory === category);
    if (subCategory) {
      return subCategory.parameters.find(param => param.name === setting) as any;
    } else {
      return undefined;
    }
  }

  private findSettingValue(settings: ISettingsSubCategory[], category: string, setting: string) {
    const param = this.findSetting(settings, category, setting);
    if (param) {
      return param.value || (param as IListInput<string>).options[0].value;
    } else {
      return undefined;
    }
  }

  private getAudioSettingsFormData(): ISettingsSubCategory[] {
    const audioDevices = this.audioService.getDevices();
    const sourcesInChannels = this.sourcesService
      .getSources()
      .filter(source => source.channel !== void 0);

    const parameters: TFormData = [];

    // collect output channels info
    for (
      let channel = E_AUDIO_CHANNELS.OUTPUT_1;
      channel <= E_AUDIO_CHANNELS.OUTPUT_2;
      channel++
    ) {
      const source = sourcesInChannels.find(
        source => source.channel === channel
      );
      const deviceInd = channel;

      parameters.push({
        value: source ? source.getObsInput().settings['device_id'] : null,
        description: `${$t('settings.desktopAudioDevice')} ${deviceInd}`,
        name: `Desktop Audio ${deviceInd > 1 ? deviceInd : ''}`,
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: $t('settings.disabled'), value: null }].concat(
          audioDevices
            .filter(device => device.type === 'output')
            .map(device => {
              if (device.id === 'default') {
                return { description: $t('settings.default'), value: device.id };
              }
              return { description: device.description, value: device.id };
            })
        )
      });
    }

    // collect input channels info
    for (
      let channel = E_AUDIO_CHANNELS.INPUT_1;
      channel <= E_AUDIO_CHANNELS.INPUT_3;
      channel++
    ) {
      const source = sourcesInChannels.find(
        source => source.channel === channel
      );
      const deviceInd = channel - 2;

      parameters.push({
        value: source ? source.getObsInput().settings['device_id'] : null,
        description: `${$t('settings.micAuxDevice')} ${deviceInd}`,
        name: `Mic/Aux ${deviceInd > 1 ? deviceInd : ''}`,
        type: 'OBS_PROPERTY_LIST',
        enabled: true,
        visible: true,
        options: [{ description: $t('settings.disabled'), value: null }].concat(
          audioDevices.filter(device => device.type === 'input').map(device => {
            if (device.id === 'default') {
              return { description: $t('settings.default'), value: device.id };
            }
            return { description: device.description, value: device.id };
          })
        )
      });
    }

    return [
      {
        nameSubCategory: 'Untitled',
        parameters
      }
    ];
  }

  setSettings(categoryName: string, settingsData: ISettingsSubCategory[]) {
    if (categoryName === 'Audio') return this.setAudioSettings(settingsData);

    const dataToSave = [];

    for (const subGroup of settingsData) {
      dataToSave.push({
        ...subGroup,
        parameters: inputValuesToObsValues(subGroup.parameters, {
          valueToCurrentValue: true
        })
      });
    }

    nodeObs.OBS_settings_saveSettings(categoryName, dataToSave);
    this.SET_SETTINGS(
      SettingsService.convertFormDataToState({ [categoryName]: settingsData })
    );
  }

  private setAudioSettings(settingsData: ISettingsSubCategory[]) {
    const audioDevices = this.audioService.getDevices();

    settingsData[0].parameters.forEach((deviceForm, ind) => {
      const channel = ind + 1;
      const isOutput = [
        E_AUDIO_CHANNELS.OUTPUT_1,
        E_AUDIO_CHANNELS.OUTPUT_2
      ].includes(channel);
      const source = this.sourcesService
        .getSources()
        .find(source => source.channel === channel);


      if (source && deviceForm.value === null) {
        if (deviceForm.value === null) {
          this.sourcesService.removeSource(source.sourceId);
          return;
        }
      } else if (deviceForm.value !== null) {

        const device = audioDevices.find(device => device.id === deviceForm.value);
        const displayName = device.id === 'default' ? deviceForm.name : device.description;

        if (!source) {
          this.sourcesService.createSource(
            displayName,
            isOutput ? 'wasapi_output_capture' : 'wasapi_input_capture',
            {},
            { channel }
          );
        } else {
          source.updateSettings({ device_id: deviceForm.value, name: displayName });
        }
      }

    });
  }

  @mutation()
  SET_SETTINGS(settingsData: ISettingsState) {
    this.state = Object.assign({}, this.state, settingsData);
  }
}
