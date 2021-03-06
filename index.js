var _ = require('underscore'),
  path = require('path'),
  fs = require('fs-extended'),
  async = require('async'),
  config = require('./lib/config'),
  constants = require('./lib/constants'),
  logger = require('./lib/logger'),
  jobs = require('./lib/jobs'),
  gm = require('gm');

/**
 * Generates icons
 * @param  {Object}   opts     options
 * @param  {Function} callback callback(err, output)
 */
exports.icons = function(opts, callback) {
  opts = opts || {};
  opts.type = 'icon';

  // config
  config(opts, function(err, cfg) {

    if (err) {
      return callback(err);
    }

    // create tasks
    jobs.createTasks(cfg, function(err, tasks) {

      if (err) {
        return callback(err);
      }

      if (cfg.cli) {
        logger.info('Starting ' + _.size(tasks) + ' jobs');
      }

      // run tasks
      async.parallel(tasks, callback);

    });

  });

};

/**
 * Generates icons
 * @param  {Object}   opts     options
 * @param  {Function} callback callback(err, output)
 */
exports.splashes = function(opts, callback) {
  opts = opts || {};
  opts.type = 'splash';

  // config
  config(opts, function(err, cfg) {

    if (err) {
      return callback(err);
    }

    // create tasks
    jobs.createTasks(cfg, function(err, tasks) {

      if (err) {
        return callback(err);
      }

      if (cfg.cli) {
        logger.info('Starting ' + _.size(tasks) + ' jobs');
      }

      // run tasks
      async.parallel(tasks, callback);

    });

  });

};

/**
 * Generates assets
 * @param  {Object}   opts     options
 * @param  {Function} callback callback(err, output)
 */
exports.assets = function(opts, callback) {
  opts = opts || {};
  opts.type = 'asset';

  // config
  config(opts, function(err, cfg) {

    if (err) {
      return callback(err);
    }

    jobs.getSpecs(cfg, function(err, specs) {
      var outputSpecs = {};
      var inputSpec;

      _.each(specs, function(spec, name) {

        if (!inputSpec && cfg.input.substr(0, spec.output.length) === spec.output) {
          inputSpec = spec;
        } else {
          outputSpecs[name] = spec;
        }

      });

      if (!inputSpec) {
        return logger.error('Could not identify input density.');
      }

      inputSpec.outputLength = inputSpec.output.length;

      if (outputSpecs['android-res-mdpi'] && outputSpecs['ios-images']) {
        delete outputSpecs['android-res-mdpi'];
      }

      var stat = fs.statSync(cfg.input);
      var files = [];

      if (stat.isDirectory()) {

        files = fs.listFilesSync(cfg.input, {
          recursive: true,
          prependDir: true,
          filter: function(itemPath, itemStat) {
            for (;;) {
              if (new RegExp( (inputSpec.suffix || '') + '\.(png|jpg)$' ).test(itemPath)) {
                return true;
              }

              if (inputSpec.fallback) {
                logger.debug('Fallbacking to '+inputSpec.fallback);
                inputSpec = specs[inputSpec.fallback];
              } else {
                return false;
              }
            }
          }
        });

      } else {
        files.push(cfg.input);
      }

      if (files.length === 0) {
        return logger.error('Could not find input images.');
      }

      var tasks = [];

      _.each(files, function(source) {
        var sourceTime = fs.statSync(source).mtime;
        var relativePath = source.substr(inputSpec.outputLength);

        _.each(outputSpecs, function(spec, n) {
          var target = path.join(spec.output, relativePath);

          if (inputSpec.suffix) {
            target = target.replace(inputSpec.suffix, spec.suffix || '');
          }

          if (!fs.existsSync(target.replace(/(\.png)$/, '.9$1')) && (!fs.existsSync(target) || (sourceTime > fs.statSync(target).mtime))) {

            tasks.push(function(callback) {

              if (inputSpec.dpi === spec.dpi) {
                fs.copyFileSync(source, target);

                // async feedback for CLI
                if (cfg.cli) {
                  logger.info('Copied: ' + target.cyan);
                }

                return callback(null, target);
              }

              fs.createDirSync(path.dirname(target));

              var im = gm.subClass({
                imageMagick: true
              });

              // read
              var convert = im(source);

              // resize
              convert.in('-resize', Math.round((spec.dpi / inputSpec.dpi) * 100) + '%');

              convert.write(target, function(err) {

                if (err) {
                  return callback(err);
                }

                // async feedback for CLI
                if (cfg.cli) {
                  logger.info('Generated: ' + target.cyan);
                }

                // pass back output
                callback(null, target);

              });

              // show command
              if (cfg.trace && cfg.cli) {
                logger.debug('Executing: ' + convert.args().join(' ').cyan);
              }

            });

          }

        });

      });

      async.series(tasks, callback);
    });

  });

};