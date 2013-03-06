/* node script to setup laravel framework */
(function(exports) {
  "use strict";
  exports.prompt = 'Do you want to include Laravel 4.0 on the build?';

  var unzipper = require('./process-zip');
  var request = require('request');
  var fs = require('fs');
  var Sink = require('pipette').Sink;
  var mkdirp = require('mkdirp');
  var path = require('path');

  function createLayout(grunt, init, done) {
    grunt.verbose.writeln('Replacing public/index.html with app/views/hello.blade.php...');

    // parse public/index.html and create a Laravel layout from it.
    mkdirp.sync('app/views/layouts');
    var layout = fs.readFileSync('public/index.html', 'utf-8');

    // add a @yield for the site title
    layout = layout.replace(/<title>[^<]*<\/title>/, '<title>@yield(\'title\')</title>');

    // add a @yield for the meta description
    layout = layout.replace(/(<meta[^>]+"description"[^>]+content=")("[^>]*>)/, '$1{{ trim($__env->yieldContent(\'description\')) }}$2');

    // add a @yield for the meta keywords
    layout = layout.replace(/(<meta[^>]+"keywords"[^>]+content=")("[^>]*>)/, '$1{{ trim($__env->yieldContent(\'keywords\')) }}$2');

    // add default @sections for title, keywords, description
    layout = layout.replace(/(<head.*[\r\n])/, '$1' +
      '{{-- Default title --}}\n' +
      '@section(\'title\')\n' +
      '  {{-- TODO --}}\n' +
      '@stop\n' +
      '\n' +
      '{{-- Default description --}}\n' +
      '@section(\'description\')\n' +
      '  {{-- TODO --}}\n' +
      '@stop\n' +
      '\n' +
      '{{-- Default keywords --}}\n' +
      '@section(\'keywords\')\n' +
      '  {{-- TODO --}}\n' +
      '@stop\n' +
      '\n');

    // add a yield at the end of the head
    layout = layout.replace(/(<\/head>\s*[\r\n]?)/g, '\n        @yield(\'head-append\')\n    $1');

    // add a default body class
    layout = layout.replace('<body', '<body class="{{ trim($__env->yieldContent(\'body-class\')) }}"');

    // replace the placeholder '<!-- Add your site or application content here -->' with a @yield
    var match = /<!--[^\r\n]*content here[^\r\n]*-->\s*<p>.*<\/p>\s*[\r\n]/.exec(layout);
    var placeholder;
    if (match) {
      layout = layout.substr(0, match.index) +
        '{{-- Global navigation --}}\n' +
        '        @include(\'partials.nav\')\n\n' +
        '        @yield(\'body\')\n\n' +
        '        @include(\'partials.footer\')\n\n' +
        layout.substr(match.index + match[0].length);
      placeholder = match[0];
    } else {
      grunt.log.warn('Unable to find content placeholder in h5bp index.html');
    }

    fs.writeFileSync('app/views/layouts/common.blade.php', layout);

    // create partials.nav and partials.footer
    mkdirp.sync('app/views/partials');
    fs.writeFileSync('app/views/partials/nav.blade.php', '');
    fs.writeFileSync('app/views/partials/footer.blade.php', '');

    // replace the Laravel default view placeholder with the h5bp placeholder
    if (fs.existsSync('app/views/hello.php')) {
      fs.unlinkSync('app/views/hello.php');
    }
    fs.writeFileSync('app/views/hello.blade.php', '@extends(\'layouts.common\')\n\n' +
      '@section(\'title\')\n' +
      '\tAdd your page title here\n' +
      '@stop\n\n' +
      '@section(\'body-class\')\n\n        ' +
      '\thello\n' +
      '@stop\n\n' +
      '@section(\'body\')\n\n        ' +
      placeholder +
      '@stop\n\n'
    );

    fs.unlinkSync('public/index.html');
    grunt.verbose.ok();

    done();
  }

  function configureEnvironments(grunt, init, done) {
    grunt.verbose.writeln('Configuring Laravel environments in bootstrap/start.php...');

    // write environment configuration to bootstrap/start.php
    var start = fs.readFileSync('bootstrap/start.php', 'utf-8');

    var config = '';
    exports.props.environments.forEach(function(environment) {
      config += "\t'" + environment + "' => array(" +
        exports.props['environment-' + environment].map(function(pattern) {
          return "'" + pattern + "'";
        }).join(', ') +
        "),\n";
    });

    start = start.replace(/(detectEnvironment[^\r\n]+[\r\n])(?:.|[\n\r])*(\)\)\;)/g,
      '$1' + config + '$2');

    fs.writeFileSync('bootstrap/start.php', start);

    grunt.verbose.ok();
    done();
  }

  function configureMail(grunt, init, done) {
    grunt.verbose.writeln('Configuring Laravel mail sender in app/config/mail.php...');

    var config = fs.readFileSync('app/config/mail.php', 'utf-8');
    config = config.replace(/(['"]host['"]\s*=>\s*['"])[^'"]+(['"])/, '$1' + exports.props.smtphost + '$2');
    config = config.replace(/(['"]port['"]\s*=>\s*)\d+/, '$1' + exports.props.smtpport);
    //'encryption' => 'ssl',
    config = config.replace(/(['"]encryption['"]\s*=>\s*)['"][^'"]+['"]/, '$1' + (exports.props.smtpencryption === '' ? 'null' : '\'' + exports.props.smtpencryption + '\''));
    config = config.replace(/(['"]username['"]\s*=>\s*)(?:null|['"][^'"]+['"])/, '$1' + (exports.props.smtpusername === '' ? 'null' : '\'' + exports.props.smtpusername + '\''));
    config = config.replace(/(['"]password['"]\s*=>\s*)(?:null|['"][^'"]+['"])/, '$1' + (exports.props.smtppassword === '' ? 'null' : '\'' + exports.props.smtppassword + '\''));
    config = config.replace(/(['"]from['"][^\r\n]*['"]address['"]\s*=>\s*)(?:null|['"][^'"]+['"])/, '$1' + (exports.props.smtpfrom === '' ? 'null' : '\'' + exports.props.smtpfrom + '\''));
    config = config.replace(/(['"]from['"][^\r\n]*['"]name['"]\s*=>\s*)(?:null|['"][^'"]+['"])/, '$1' + (exports.props.smtpfromname === '' ? 'null' : '\'' + exports.props.smtpfromname + '\''));

    fs.writeFileSync('app/config/mail.php', config);

    grunt.verbose.ok();
    done();
  }

  function downloadLaravel(grunt, init, done) {
    unzipper.processZip(request('https://github.com/laravel/laravel/archive/develop.zip'), {
      fromdir: 'laravel-develop/',
      verbose: function(msg) {
        grunt.verbose.writeln(msg);
      },
      complete: done,
      rename: function(file) {
        var matches = /^(.*)\.md$/.exec(file);
        if (matches) {
          return matches[1] + '-Laravel.md';
        }
        if (file === 'public/.htaccess') {
          // need to append this file because it already exists (comes with h5bp)
          new Sink(this).on('data', function(buffer) {
            var htaccess = '\n' +
              '# ----------------------------------------------------------------------\n' +
              '# Laravel framework\n' +
              '# ----------------------------------------------------------------------\n' +
              buffer.toString();
            fs.appendFileSync(file, htaccess);
          });
        }
        return file;
      }
    });
  }

  exports.initTemplate = function(grunt, init, done) {
    // need to ask the user some more questions...
    init.process({}, [
      {
        name: 'environments',
        message: 'What environments (other than local) do you want to configure?',
        warning: 'Must be zero or more space-separated environment names.',
        'default': 'stage beta live',
        // Split the string on spaces.
        sanitize: function(value, data, done) { done(['local'].concat(value.split(/\s+/))); }
      },
      {
        name: 'mail',
        message: 'Do you want to configure an SMTP mail server?',
        'default': 'Y/n'
      }
    ], function(err, props) {
      var prompts = [
      ];
      // if the user specified some environments then we'll need to ask how they should be detected.
      props.environments.forEach(function(environment) {
        prompts.push({
          name: 'environment-' + environment,
          message: 'What hostname patterns will be matched on the environment "' + environment + '"?',
          warning: 'Must be zero or more space-separated hostname patterns.',
            'default': environment === 'live' ? 'your-live-host.com' :
              environment === 'local' ? 'localhost *.dev *.dev:*' : 'your-' + environment + '-name.monkeylabs.com.au',
          // Split the string on spaces.
          sanitize: function(value, data, done) { done(value.split(/\s+/)); }
        });
      });
      // if the user wants to configure an SMTP mail server then we'll need to ask for details now.
      if (/y/i.test(props.mail)) {
        prompts = prompts.concat([
          {
            name: 'smtphost',
            message: 'What SMTP Host Address do you want to use?',
            'default': 'smtp.gmail.com'
          },
          {
            name: 'smtpport',
            message: 'What SMTP Host Port do you want to use?',
            'default': '465'
          },
          {
            name: 'smtpencryption',
            message: 'What E-Mail Encryption Protocol do you want to use?',
            'default': 'ssl'
          },
          {
            name: 'smtpusername',
            message: 'What SMTP Server Username do you want to use, if any?',
            'default': 'smtp@themonkeys.com.au'
          },
          {
            name: 'smtppassword',
            message: 'What SMTP server Password do you want to use, if any?',
            'default': 'devbananas'
          },
          {
            name: 'smtpfrom',
            message: 'What Global "From" Address do you want to use, if any?',
            'default': 'noreply@themonkeys.com.au'
          },
          {
            name: 'smtpfromname',
            message: 'What Global "From" Name do you want to use, if any?',
            'default': 'none'
          }
        ]);
      }
      if (prompts.length) {
        init.process({}, prompts, function(err, detailedProps) {
          exports.props = grunt.util._.extend(props, detailedProps);
          next();
        });
      } else {
        exports.props = props;
        next();
      }
    });

    function next() {
      // Laravel is enabled so enable copying across files under app/
      // but only copy the environments that are required
      var mail = /y/i.test(exports.props.mail);
      for (var src in init.renames) {
        if (src.indexOf('app/config/') === 0) {
          var enable = true;

          var match = /app\/config\/env(\d+)/.exec(src);
          var env = null;
          if (match) {
            var i = parseInt(match[1], 10);
            if (i < exports.props.environments.length) {
              env = exports.props.environments[i];
            } else {
              enable = false;
            }
          }

          // if mail was not enabled then don't copy app/config/**/mail.php
          if (!mail && /mail.php$/.test(src)) {
            enable = false;
          }

          if (enable) {
            if (env) {
              // rename the environment part of the pathname
              init.renames[src] = 'app/config/' + env + '/' + path.basename(src);
            } else {
              delete init.renames[src];
            }
          }
        }
      }
      console.log(init.renames);
      done();
    }
  };

  exports.template = function(grunt, init, done) {
    grunt.log.write("Setting up the Laravel framework...");

    var tasks = [
      downloadLaravel,
      createLayout,
      configureEnvironments
    ];
    if (/y/i.test(exports.props.mail)) {
      tasks.push(configureMail);
    }

    (function next() {
      (tasks.shift())(grunt, init, function() {
        if (tasks.length) {
          next();
        } else {
          done();
        }
      });
    }());
  };
}(typeof exports === 'object' && exports || this));
