(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token') || '';
  var base = 'http://localhost:3001/api/v1/dicomweb' + (token ? '/t/' + encodeURIComponent(token) : '');

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
        friendlyName: 'SmartPACS DICOMweb (dev)',
        namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
        sourceName: 'dicomweb',
        configuration: {
          friendlyName: 'SmartPACS DICOMweb (dev)',
          name: 'SmartPACS',
          qidoRoot: base,
          wadoRoot: base,
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
})();
