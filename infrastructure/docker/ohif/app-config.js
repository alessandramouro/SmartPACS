(function () {
  // The viewer token lives in the page URL's ?token= param. OHIF's DICOMweb
  // client builds its own request URLs from a static qidoRoot/wadoRoot and
  // never forwards that query string, so the token is baked into the root
  // path instead ("/dicomweb/t/<token>"), which the API proxy accepts as an
  // alternative to a ?token= query param or a normal Authorization header.
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token') || '';
  var base = 'https://app.smartpacs.com.br/api/v1/dicomweb' + (token ? '/t/' + encodeURIComponent(token) : '');

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
          friendlyName: 'SmartPACS DICOMweb',
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
