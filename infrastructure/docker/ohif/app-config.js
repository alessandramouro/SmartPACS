window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: false,
  maxNumberOfWebWorkers: 3,
  omitQuotationForMultipartRequest: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  dataSources: [
    {
      friendlyName: 'SmartPACS DICOMweb',
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        // Proxied by the NestJS API, never talks to the central Orthanc directly.
        // The viewer URL carries a short-lived ?token= query param that the
        // proxy accepts as an alternative to the normal Authorization header,
        // since OHIF's default dicomweb client cannot be told to set one.
        friendlyName: 'SmartPACS DICOMweb',
        name: 'SmartPACS',
        qidoRoot: 'https://app.smartpacs.com.br/api/v1/dicomweb',
        wadoRoot: 'https://app.smartpacs.com.br/api/v1/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        staticWado: true,
        singlepart: 'bulkdata,video,pdf',
      },
    },
  ],
  defaultDataSourceName: 'dicomweb',
};
