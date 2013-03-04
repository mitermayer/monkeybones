#!/bin/bash

# script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# list executable commands separated by space
commandependencies=( php mysql npm grunt docco compass composer )

# show success message
function msgsuccess() {
    echo "$(tput setaf 2)OK$(tput sgr0)";
}

# show fail message and stop execution
function msgfail() {
    echo -e >&2 "$(tput setaf 1)FAIL$(tput sgr0)"; exit 1;
}

# check executable is on env path
function checkcommand() {
    command -v $1 >/dev/null 2>&1 || { msgfail; }
}

# check for project dependencies
function checkdependencies() {
    for i in "${commandependencies[@]}"
    do
        echo -n "Checking for executable $i..."
        checkcommand $i
        msgsuccess
    done

    installdependencies
}

# check for project dependencies
function installdependencies() {
    # install npm modules
    echo "Installing npm dependencies..."
    npm install

    # install composer modules
    if [ -f composer.json ]
    then
        echo "Installing composer dependencies..."
        composer install
    fi

    echo "Installing basic javascript files"
    grunt install
}

# Setup building process
function build() {
    
    # run grunt default task
    echo "Running grunt default task.."
    grunt 

    # generate documentation
    echo "Generating documentation.."
    grunt docco
}


# commands to restore default state
function revertbuild() {
    : cleaning commands

    echo "Removing npm dependencies.."
    rm -rf ${DIR}/../node_modules
}

case "$1" in
    "")
        checkdependencies
        build
    ;;
    build)
        build
    ;;
    rebuild)
        revertbuild
        build
    ;;
    check)
        checkdependencies
    ;;
esac
