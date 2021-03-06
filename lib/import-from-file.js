/**
 * @file 从本地文件导入包
 * @author errorrik[errorrik@gmail.com]
 */
var fs = require('fs');
var path = require('path');
var async = require('async');
var mkdirp = require('mkdirp');
var edp = require('edp-core');

var pkg = require('./pkg');


/**
 * 从本地文件导入包
 *
 * @param {ProjectContext} context
 * @param {string} file 包名称
 * @param {Function} callback 回调函数
 */
module.exports = function(context, file, callback) {
    var extractMethod;
    var extract = require('./util/extract');
    var fileExtname = path.extname(file).slice(1);
    switch (fileExtname) {
        case 'gz':
        case 'tgz':
            extractMethod = extract.tgz;
            break;
        case 'zip':
            extractMethod = extract.zip;
            break;
        default:
            throw new Error(fileExtname + ' file is not supported!');
    }

    // XXX 这里的depDir不是项目的dep目录，而是一个临时创建的项目中dep目录
    // lib/util/get-temp-import-dir.js 会创建一个临时的目录，临时目录中存在
    // tmpdir/
    //   .edpproj/
    //   dep/
    var depDir = context.getShadowDependenciesDir();
    var tempDir = path.resolve(depDir, pkg.getTempName());

    var tasks = [
        extractArchive(file, tempDir, extractMethod),
        moveToTargetDirectory(tempDir),
        pkg.importDependencies(context)
    ];
    async.waterfall(tasks, callback);
};

/**
 * 解压到临时的目录
 */
function extractArchive(file, tempDir, method) {
    return function(callback) {
        try {
            method(file, tempDir, function() {
                if (!fs.existsSync(tempDir)) {
                    // 压缩包解压失败了？
                    callback(new Error(file + ' decompress failed!'));
                    return;
                }

                callback(null);
            });
        }
        catch (ex) {
            callback(ex);
        }
    };
}

/**
 * 把临时目录重名为目标目录
 */
function moveToTargetDirectory(tempDir) {
    return function(callback) {
        var packageInfo = require('./util/get-package-info')(tempDir);

        var name = packageInfo.name;
        var version = packageInfo.version;
        var target = path.join(tempDir, '..', name, version);

        if (fs.existsSync(target)) {
            // 如果目标包目录已经存在，不进行操作
            // 只需要删除当前的临时目录即可
            edp.util.rmdir(tempDir);
        }
        else {
            mkdirp.sync(path.dirname(target));
            fs.renameSync(tempDir, target);
        }

        // 放一个文件，里面是包中所有文件的MD5码，以便升级时可以做一下
        // 对比看有哪些文件被本地修改过
        require('./util/get-package-md5sum')(
            target,
            function(err, md5sum) {
                if (err) {
                    callback(err);
                    return;
                }

                // 将MD5码放在上一级目录
                fs.writeFileSync(
                    path.resolve(target, '..', version + '.md5'),
                    JSON.stringify(md5sum, null, 4)
                );

                callback(null, packageInfo);
            });
    };
}

if (require.main === module) {
    module.exports(
        require('./context').create(
            path.join(__dirname, '..', 'test', 'tmp', 'dummy-project')),
        'tmp/er-3.1.0-beta.4.tgz',
        function(error, data) {
            console.log(arguments);
        });
}
