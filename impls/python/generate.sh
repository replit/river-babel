docker buildx build --build-context pkgs=. . -t river_python_builder

docker run --rm -v $(pwd):/usr/src/python_impl river_python_builder                         
